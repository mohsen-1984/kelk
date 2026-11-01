/*
 * Kelk — polyfills for the modern PDF.js build (tools/build-pdfjs.js puts this file in front of
 * pdf_<v>.js and pdf.worker_<v>.js). PDF.js's generic build calls the newest built-ins directly;
 * a browser a few versions old lacks some of them (e.g. Map.prototype.getOrInsertComputed).
 * Each one is defined only when missing, so current browsers run their own.
 */
(function () {
    'use strict';
    function def(obj, name, fn) {
        if (obj && typeof obj[name] !== 'function') {
            Object.defineProperty(obj, name, { value: fn, writable: true, configurable: true, enumerable: false });
        }
    }

    // Map / WeakMap upsert (getOrInsert, getOrInsertComputed)
    [typeof Map !== 'undefined' && Map.prototype, typeof WeakMap !== 'undefined' && WeakMap.prototype].forEach(function (p) {
        def(p, 'getOrInsert', function (key, value) {
            if (!this.has(key)) this.set(key, value);
            return this.get(key);
        });
        def(p, 'getOrInsertComputed', function (key, callback) {
            if (!this.has(key)) this.set(key, callback(key));
            return this.get(key);
        });
    });

    // Math.sumPrecise (Neumaier compensated sum)
    def(Math, 'sumPrecise', function (items) {
        let sum = 0, c = 0, n = 0;
        for (const x of items) {
            if (typeof x !== 'number') throw new TypeError('Math.sumPrecise: not a number');
            n++;
            const t = sum + x;
            c += Math.abs(sum) >= Math.abs(x) ? (sum - t) + x : (x - t) + sum;
            sum = t;
        }
        return n ? sum + c : -0;
    });

    // Promise.withResolvers, Promise.try
    def(Promise, 'withResolvers', function () {
        let resolve, reject;
        const promise = new this(function (a, b) { resolve = a; reject = b; });
        return { promise: promise, resolve: resolve, reject: reject };
    });
    def(Promise, 'try', function (fn) {
        const args = Array.prototype.slice.call(arguments, 1), P = this;
        return new P(function (resolve) { resolve(fn.apply(undefined, args)); });
    });

    // Uint8Array base64 / hex
    def(Uint8Array, 'fromBase64', function (str) {
        const bin = atob(String(str).replace(/[\s]/g, '').replace(/-/g, '+').replace(/_/g, '/'));
        const out = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
    });
    def(Uint8Array.prototype, 'toBase64', function () {
        let s = '';
        for (let i = 0; i < this.length; i += 0x8000) s += String.fromCharCode.apply(null, this.subarray(i, i + 0x8000));
        return btoa(s);
    });
    def(Uint8Array.prototype, 'toHex', function () {
        let s = '';
        for (let i = 0; i < this.length; i++) s += (this[i] < 16 ? '0' : '') + this[i].toString(16);
        return s;
    });

    // ArrayBuffer.prototype.transferToFixedLength
    if (typeof ArrayBuffer !== 'undefined') {
        def(ArrayBuffer.prototype, 'transferToFixedLength', function (len) {
            const n = len === undefined ? this.byteLength : len;
            const out = new ArrayBuffer(n);
            new Uint8Array(out).set(new Uint8Array(this, 0, Math.min(n, this.byteLength)));
            return out;
        });
    }

    // Set.prototype.intersection
    def(Set.prototype, 'intersection', function (other) {
        const out = new Set();
        this.forEach(function (v) { if (other.has(v)) out.add(v); });
        return out;
    });

    // URL.parse
    if (typeof URL !== 'undefined') def(URL, 'parse', function (url, base) {
        try { return new URL(url, base); } catch (e) { return null; }
    });

    // AbortSignal.any
    if (typeof AbortSignal !== 'undefined' && typeof AbortController !== 'undefined') def(AbortSignal, 'any', function (signals) {
        const ctl = new AbortController();
        for (const s of signals) {
            if (s.aborted) { ctl.abort(s.reason); return ctl.signal; }
            s.addEventListener('abort', function () { ctl.abort(s.reason); }, { once: true });
        }
        return ctl.signal;
    });

    // Iterator global and helpers (filter, map, toArray); PDF.js adds Iterator.prototype.join itself
    const IterProto = Object.getPrototypeOf(Object.getPrototypeOf([][Symbol.iterator]()));
    if (typeof globalThis.Iterator === 'undefined') {
        const Iter = function Iterator() {};
        Iter.prototype = IterProto;
        Object.defineProperty(globalThis, 'Iterator', { value: Iter, writable: true, configurable: true });
    }
    def(IterProto, 'toArray', function () { const out = []; for (const v of this) out.push(v); return out; });
    def(IterProto, 'filter', function (pred) {
        const it = this; let i = 0;
        return (function* () { for (const v of it) if (pred(v, i++)) yield v; })();
    });
    def(IterProto, 'map', function (fn) {
        const it = this; let i = 0;
        return (function* () { for (const v of it) yield fn(v, i++); })();
    });
})();
