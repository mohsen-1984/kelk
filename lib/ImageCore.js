/**
 * ImageCore - shared image resolution for WordHtmlBuilder, DocxBuilder and PdfBuilder
 * ============================================================================
 * Version: 1.5
 *
 * Turns every image source a document uses into embeddable bytes BEFORE a
 * builder lays the document out (resolution is async; layout stays sync):
 *
 *   source                       how
 *   ─────────────────────────    ──────────────────────────────────────────
 *   registered name ('logo')     store.register('logo', File|Blob|bytes|url)
 *   data:image/…;base64,…        decoded directly
 *   https://…, http://…          fetch — the server must allow CORS
 *   logo.png, ./img/a.png, /x    fetch relative to options.baseUrl or the page
 *   file://…                     NOT readable by a web page (browser rule):
 *                                pick the file (<input type=file>, drag & drop)
 *                                and register it instead
 *
 * Formats: PNG and JPEG are kept byte for byte (no recompression). SVG is
 * rasterized to PNG at options.svgScale × its size (default 3 — sharp in
 * print); GIF, WebP, BMP … are re-encoded as PNG (first frame).
 * A source that cannot be read resolves to { error } — builders then print
 * the alt text — and a console.warn names it.
 *
 * Record: { src, mime: 'image/png'|'image/jpeg', ext: 'png'|'jpg',
 *           bytes: Uint8Array, base64, width, height }   (CSS px @ 96 dpi —
 *           the size to DISPLAY; a rasterized SVG has 3× the pixels)
 *
 * Usage (builders do this in their async outputs):
 *   const store = ImageCore.createStore();
 *   store.register('logo', fileInput.files[0]);
 *   await store.resolveAll(['logo', 'https://…/a.svg']);
 *   store.get('logo')   // → record | null
 */
(function (global) {
    'use strict';

    const DEFAULTS = Object.freeze({
        baseUrl: null,      // base for relative paths (default: document.baseURI)
        svgScale: 3,        // SVG → PNG pixel density
        timeout: 10000      // ms per fetch
    });

    const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|svg)(\?[^#]*)?(#.*)?$/i;

    /**
     * Tolerate a source pasted with HTML around it: surrounding quotes, a
     * leading src= (src="data:…" copied from an <img>), line breaks inside
     * a data URI.
     */
    function normalizeSrc(v) {
        let t = String(v == null ? '' : v).trim();
        t = t.replace(/^src\s*=\s*/i, '').replace(/^(["'])([\s\S]*)\1$/, '$2').trim();
        if (/^data:/i.test(t)) t = t.replace(/\s+/g, '');
        return t;
    }

    /**
     * Does a header value look like an image source rather than text?
     * (data:image, a URL, a path ending in an image extension, or a
     * registered name). Keeps setHeader({ logo: 'Text' }) working as text.
     */
    function looksLikeImage(value, store) {
        if (!value || typeof value !== 'string') return false;
        const v = normalizeSrc(value);
        if (store && store.registry.has(v)) return true;
        if (/^data:image\//i.test(v)) return true;
        if (/^(https?|file|blob):/i.test(v)) return true;
        return IMAGE_EXT.test(v) && !/\s/.test(v);
    }

    function sniff(bytes) {
        const b = bytes;
        if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return 'image/png';
        if (b.length > 3 && b[0] === 0xFF && b[1] === 0xD8) return 'image/jpeg';
        if (b.length > 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif';
        if (b.length > 12 && b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57 && b[9] === 0x45) return 'image/webp';
        if (b.length > 2 && b[0] === 0x42 && b[1] === 0x4D) return 'image/bmp';
        const head = new TextDecoder().decode(b.subarray(0, Math.min(b.length, 1024)));
        if (/<svg[\s>]/i.test(head)) return 'image/svg+xml';
        return '';
    }

    function toBase64(bytes) {
        let s = '';
        for (let i = 0; i < bytes.length; i += 0x8000) {
            s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        }
        return btoa(s);
    }

    function fromBase64(b64) {
        const s = atob(b64);
        const out = new Uint8Array(s.length);
        for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
        return out;
    }

    async function fetchBytes(url, timeout) {
        const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const t = ctl ? setTimeout(function () { ctl.abort(); }, timeout) : null;
        try {
            const res = await fetch(url, ctl ? { signal: ctl.signal } : undefined);
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return new Uint8Array(await res.arrayBuffer());
        } finally {
            if (t) clearTimeout(t);
        }
    }

    /** Decode bytes in the browser → HTMLImageElement (natural size known). */
    function loadImage(bytes, mime) {
        return new Promise(function (resolve, reject) {
            const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
            const img = new Image();
            img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
            img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('cannot decode image')); };
            img.src = url;
        });
    }

    function canvasPng(img, w, h) {
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(w));
        c.height = Math.max(1, Math.round(h));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        return fromBase64(c.toDataURL('image/png').split(',')[1]);
    }

    /** CSS px size an SVG declares (width/height, else viewBox), or null. */
    function svgSize(text) {
        const tag = /<svg\b[^>]*>/i.exec(text);
        if (!tag) return null;
        const attr = function (n) { const m = new RegExp('\\s' + n + '\\s*=\\s*["\']([^"\']+)["\']', 'i').exec(tag[0]); return m ? m[1] : null; };
        const px = function (v) {
            const m = /^\s*([\d.]+)\s*(px|pt|cm|mm|in)?\s*$/i.exec(v || '');
            if (!m) return 0;
            const k = { px: 1, pt: 96 / 72, cm: 96 / 2.54, mm: 96 / 25.4, in: 96 }[(m[2] || 'px').toLowerCase()];
            return parseFloat(m[1]) * k;
        };
        let w = px(attr('width')), h = px(attr('height'));
        const vb = (attr('viewBox') || '').split(/[\s,]+/).map(parseFloat);
        if ((!w || !h) && vb.length === 4 && vb[2] > 0 && vb[3] > 0) {
            if (w && !h) h = w * vb[3] / vb[2];
            else if (h && !w) w = h * vb[2] / vb[3];
            else { w = vb[2]; h = vb[3]; }
        }
        return w && h ? { w: w, h: h } : null;
    }

    class ImageStore {
        constructor(options) {
            this.registry = new Map();
            this.cache = new Map();          // key → Promise<record>
            this.done = new Map();           // key → record (after resolveAll)
            this.options = Object.assign({}, DEFAULTS, options || {});
        }

        /** name → File | Blob | ArrayBuffer | Uint8Array | data URI | URL/path */
        register(name, source) {
            const k = String(name);
            this.registry.set(k, source);
            this.cache.delete(k);
            this.done.delete(k);
            return this;
        }

        setOptions(options) {
            Object.assign(this.options, options || {});
            this.cache.clear();
            this.done.clear();
            return this;
        }

        /** Resolved record for a src (after resolveAll), or null. */
        get(src) {
            const r = this.done.get(normalizeSrc(src));
            return r && !r.error ? r : null;
        }

        async resolveAll(srcs) {
            const self = this;
            const keys = Array.from(new Set((srcs || []).map(normalizeSrc).filter(Boolean)));
            await Promise.all(keys.map(function (k) {
                return self.resolve(k).then(function (r) { self.done.set(k, r); });
            }));
            return this;
        }

        resolve(src) {
            const k = normalizeSrc(src);
            if (!this.cache.has(k)) this.cache.set(k, this._load(k));
            return this.cache.get(k);
        }

        async _load(key) {
            const o = this.options;
            try {
                let source = this.registry.has(key) ? this.registry.get(key) : key;
                if (typeof source === 'string') source = normalizeSrc(source);
                let bytes;
                if (source instanceof Uint8Array) bytes = source;
                else if (source instanceof ArrayBuffer) bytes = new Uint8Array(source);
                else if (typeof Blob !== 'undefined' && source instanceof Blob) bytes = new Uint8Array(await source.arrayBuffer());
                else if (typeof source === 'string') {
                    const s = source.trim();
                    const m = /^data:([^;,]*)(;base64)?,(.*)$/i.exec(s);
                    if (m) {
                        bytes = m[2] ? fromBase64(m[3]) : new TextEncoder().encode(decodeURIComponent(m[3]));
                    } else {
                        if (/^file:/i.test(s)) throw new Error('file:// cannot be read by a web page — register the file instead');
                        const base = o.baseUrl || (typeof document !== 'undefined' ? document.baseURI : undefined);
                        bytes = await fetchBytes(new URL(s, base).href, o.timeout);
                    }
                } else throw new Error('unsupported image source');

                const mime = sniff(bytes);
                if (!mime) throw new Error('not an image');
                if (mime === 'image/svg+xml') {
                    const text = new TextDecoder().decode(bytes);
                    const img = await loadImage(bytes, mime);
                    const size = svgSize(text) || { w: img.naturalWidth || 300, h: img.naturalHeight || 150 };
                    const png = canvasPng(img, size.w * o.svgScale, size.h * o.svgScale);
                    return this._record(key, 'image/png', png, size.w, size.h);
                }
                const img = await loadImage(bytes, mime);
                if (mime === 'image/png' || mime === 'image/jpeg') {
                    return this._record(key, mime, bytes, img.naturalWidth, img.naturalHeight);
                }
                const png = canvasPng(img, img.naturalWidth, img.naturalHeight);
                return this._record(key, 'image/png', png, img.naturalWidth, img.naturalHeight);
            } catch (e) {
                if (typeof console !== 'undefined' && console.warn) {
                    console.warn('ImageCore: image not embedded (' + (e && e.message || e) + '): ' + key.slice(0, 120));
                }
                return { src: key, error: String(e && e.message || e) };
            }
        }

        _record(src, mime, bytes, w, h) {
            return {
                src: src, mime: mime, ext: mime === 'image/jpeg' ? 'jpg' : 'png',
                bytes: bytes, base64: toBase64(bytes),
                width: Math.max(1, Math.round(w)), height: Math.max(1, Math.round(h))
            };
        }
    }

    /**
     * Display size (CSS px) of an <img>: its width/height attributes (or
     * style width/height in px), keeping the aspect ratio when only one is
     * given; else the image's own size. Capped at maxWidth (px) if given.
     */
    function displaySize(img, rec, maxWidth) {
        const num = function (v) { const m = /^\s*([\d.]+)\s*(px)?\s*$/i.exec(v || ''); return m ? parseFloat(m[1]) : 0; };
        const st = (img && img.getAttribute && img.getAttribute('style')) || '';
        const sw = /(?:^|;)\s*width\s*:\s*([\d.]+)px/i.exec(st), sh = /(?:^|;)\s*height\s*:\s*([\d.]+)px/i.exec(st);
        let w = img && img.getAttribute ? num(img.getAttribute('width')) || (sw ? parseFloat(sw[1]) : 0) : 0;
        let h = img && img.getAttribute ? num(img.getAttribute('height')) || (sh ? parseFloat(sh[1]) : 0) : 0;
        const ratio = rec.height / rec.width;
        if (w && !h) h = w * ratio;
        else if (h && !w) w = h / ratio;
        else if (!w && !h) { w = rec.width; h = rec.height; }
        if (maxWidth && w > maxWidth) { h *= maxWidth / w; w = maxWidth; }
        return { width: Math.max(1, Math.round(w)), height: Math.max(1, Math.round(h)) };
    }

    /** Fit (w, h) into a box of at most maxW × maxH, keeping the ratio. */
    function fit(w, h, maxW, maxH) {
        let s = 1;
        if (maxW && w > maxW) s = Math.min(s, maxW / w);
        if (maxH && h > maxH) s = Math.min(s, maxH / h);
        return { width: w * s, height: h * s };
    }

    /**
     * All <img src> values of an element or an HTML string — for resolveAll.
     * A string is parsed inert (DOMParser), so nothing starts loading.
     */
    function collectSources(root) {
        const out = [];
        if (typeof root === 'string') {
            if (typeof DOMParser === 'undefined') return out;
            root = new DOMParser().parseFromString(root, 'text/html').body;
        }
        if (root && root.querySelectorAll) {
            root.querySelectorAll('img[src]').forEach(function (img) { out.push(img.getAttribute('src')); });
        }
        return out;
    }

    const ImageCore = {
        DEFAULTS: DEFAULTS,
        createStore: function (options) { return new ImageStore(options); },
        looksLikeImage: looksLikeImage,
        normalizeSrc: normalizeSrc,
        displaySize: displaySize,
        fit: fit,
        collectSources: collectSources,
        toBase64: toBase64,
        fromBase64: fromBase64
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = ImageCore;
    else if (typeof define === 'function' && define.amd) define([], function () { return ImageCore; });
    else global.ImageCore = ImageCore;
})(typeof window !== 'undefined' ? window : this);
