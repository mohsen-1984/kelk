/**
 * FontEmbed — the fonts a .docx or .pptx uses, embedded in the file after its builder wrote it, so it shows them
 * on a computer that does not have them (Settings → Fonts → Embed fonts; Kelk.fonts.embed calls it).
 *
 *   FontEmbed.docx(file, fonts, o) → Promise<Blob | Uint8Array>
 *   FontEmbed.pptx(file, fonts, o) → Promise<Blob | Uint8Array>
 *     file   the builder's output (Blob, ArrayBuffer or Uint8Array: what JSZip reads)
 *     fonts  [{ name, regular?, bold?, charset? }] — regular / bold: the TrueType files (Uint8Array), as they are;
 *            charset: the Windows character set the font declares (0 ANSI, 178 Arabic). A font without faces is
 *            only described (its charset in the .docx font table), not embedded.
 *     o      { type: 'blob' | 'uint8array' (default 'blob'), guid: () => '{…}' (tests) }
 *
 * DOCX (ECMA-376 Part 1 §17.8.1, §17.8.3): each face an obfuscated font part, word/fonts/*.odttf (content type
 * application/vnd.openxmlformats-officedocument.obfuscatedFont): its first 32 bytes XORed with the 16 bytes of
 * a new GUID read backwards; w:embedRegular / w:embedBold with that GUID as w:fontKey in word/fontTable.xml, a
 * font relationship in word/_rels/fontTable.xml.rels; w:embedTrueTypeFonts in word/settings.xml (Word's Options →
 * Save → «Embed fonts in the file»).
 *
 * PPTX ([MS-OI29500] §2.1.1134 on Part 1 §19.2.1.9 and §15.2.13): each face a font part, ppt/fonts/*.fntdata, of
 * content type application/x-fontdata, in which PowerPoint stores TrueType fonts in the Embedded OpenType format
 * (EOT, W3C submission 2008) — here version 0x00020001, the font data neither compressed nor XORed (Flags 0);
 * p:embeddedFontLst in ppt/presentation.xml (after p:notesSz), embedTrueTypeFonts="1" on p:presentation
 * (PowerPoint's «Embed fonts in the file»; saveSubsetFonts goes: the whole font is embedded).
 *
 * Works in the page and in Node (tests/unit/font-embed.test.js; tests/docx-validate.js checks an embedded .docx
 * against the schemas and opens it in LibreOffice). Needs JSZip (global, or require('jszip') in Node).
 */
(function (root) {
    'use strict';

    const REL_FONT = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/font';
    const REL_FONT_TABLE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/fontTable';
    const CT_ODTTF = 'application/vnd.openxmlformats-officedocument.obfuscatedFont';
    const CT_FNTDATA = 'application/x-fontdata';
    const CT_FONT_TABLE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml';
    const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    const FACES = [['regular', 'embedRegular'], ['bold', 'embedBold']];
    // CT_Settings: the elements before w:embedTrueTypeFonts in its sequence
    const SETTINGS_BEFORE = ['writeProtection', 'view', 'zoom', 'removePersonalInformation', 'removeDateAndTime',
        'doNotDisplayPageBoundaries', 'displayBackgroundShape', 'printPostScriptOverText',
        'printFractionalCharacterWidth', 'printFormsData'];

    function zipLib() {
        if (root.JSZip) return root.JSZip;
        if (typeof require === 'function') return require('jszip');
        throw new Error('FontEmbed needs JSZip');
    }

    const esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };

    /** A new GUID, «{XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX}», upper case. */
    function newGuid() {
        const b = new Uint8Array(16);
        const c = root.crypto || (typeof require === 'function' ? require('node:crypto').webcrypto : null);
        if (c && c.getRandomValues) c.getRandomValues(b); else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
        b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;          // version 4, variant 10
        const h = Array.from(b, function (x) { return (x < 16 ? '0' : '') + x.toString(16); }).join('').toUpperCase();
        return '{' + h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20) + '}';
    }

    /**
     * §17.8.1: the key is the GUID's 32 hex digits read from the last pair to the first; the font's first 32 bytes
     * are XORed with it (bytes 0–15 and 16–31 alike). The same call undoes it.
     */
    function obfuscate(font, guid) {
        const hex = String(guid).replace(/[^0-9a-fA-F]/g, '');
        if (hex.length !== 32) throw new Error('FontEmbed: bad font key ' + guid);
        const key = new Uint8Array(16);
        for (let i = 0; i < 16; i++) key[i] = parseInt(hex.substr(30 - 2 * i, 2), 16);
        const out = new Uint8Array(font);                                   // a copy
        for (let i = 0; i < 32 && i < out.length; i++) out[i] ^= key[i % 16];
        return out;
    }

    /** The tables of a TrueType file: { tag: { offset, length } }. */
    function tables(f) {
        const v = new DataView(f.buffer, f.byteOffset, f.byteLength), n = v.getUint16(4), t = {};
        for (let i = 0; i < n; i++) {
            const o = 12 + 16 * i;
            t[String.fromCharCode(f[o], f[o + 1], f[o + 2], f[o + 3])] = { offset: v.getUint32(o + 8), length: v.getUint32(o + 12) };
        }
        return t;
    }

    /** A name of the 'name' table as UTF-16LE bytes (Windows, Unicode; English first), or none. */
    function nameLE(f, t, id) {
        if (!t.name) return new Uint8Array(0);
        const v = new DataView(f.buffer, f.byteOffset, f.byteLength), base = t.name.offset;
        const count = v.getUint16(base + 2), strings = base + v.getUint16(base + 4);
        let best = null;
        for (let i = 0; i < count; i++) {
            const r = base + 6 + 12 * i;
            const pid = v.getUint16(r), eid = v.getUint16(r + 2), lang = v.getUint16(r + 4), nid = v.getUint16(r + 6);
            if (nid !== id || pid !== 3 || (eid !== 1 && eid !== 0)) continue;
            const rec = { len: v.getUint16(r + 8), off: v.getUint16(r + 10) };
            if (!best || lang === 0x0409) best = rec;
        }
        if (!best) return new Uint8Array(0);
        const out = new Uint8Array(best.len);
        for (let i = 0; i + 1 < best.len; i += 2) { out[i] = f[strings + best.off + i + 1]; out[i + 1] = f[strings + best.off + i]; }
        return out;
    }

    /**
     * The font in the Embedded OpenType format, version 0x00020001, uncompressed: the header (sizes, PANOSE,
     * charset, italic, weight, fsType, the magic number, Unicode and code-page ranges, the checksum adjustment,
     * the family, style, version and full names), then the TrueType file as it is.
     */
    function eot(font, charset) {
        const f = font instanceof Uint8Array ? font : new Uint8Array(font);
        const t = tables(f), v = new DataView(f.buffer, f.byteOffset, f.byteLength);
        const os2 = t['OS/2'] ? t['OS/2'].offset : -1;
        const names = [1, 2, 5, 4].map(function (id) { return nameLE(f, t, id); });
        const headSize = 80 + names.reduce(function (n, s) { return n + 4 + s.length; }, 0) + 4;
        const out = new Uint8Array(headSize + f.length), o = new DataView(out.buffer);
        let p = 0;
        const u32 = function (x) { o.setUint32(p, x >>> 0, true); p += 4; };
        const u16 = function (x) { o.setUint16(p, x, true); p += 2; };
        u32(out.length); u32(f.length); u32(0x00020001); u32(0);
        for (let i = 0; i < 10; i++) out[p++] = os2 >= 0 ? f[os2 + 32 + i] : 0;  // FontPANOSE
        out[p++] = charset == null ? 1 : charset;                            // 1: DEFAULT_CHARSET
        out[p++] = os2 >= 0 ? v.getUint16(os2 + 62) & 1 : 0;                 // fsSelection: italic
        u32(os2 >= 0 ? v.getUint16(os2 + 4) : 400);                          // usWeightClass
        u16(os2 >= 0 ? v.getUint16(os2 + 8) : 0);                            // fsType
        u16(0x504C);                                                         // the magic number
        for (let i = 0; i < 4; i++) u32(os2 >= 0 ? v.getUint32(os2 + 42 + 4 * i) : 0);
        const ver = os2 >= 0 ? v.getUint16(os2) : 0;
        for (let i = 0; i < 2; i++) u32(os2 >= 0 && ver >= 1 ? v.getUint32(os2 + 78 + 4 * i) : 0);
        u32(t.head ? v.getUint32(t.head.offset + 8) : 0);                    // checkSumAdjustment
        for (let i = 0; i < 4; i++) u32(0);                                  // Reserved1–4
        names.forEach(function (s) { u16(0); u16(s.length); out.set(s, p); p += s.length; });   // padding, size, name
        u16(0); u16(0);                                                      // Padding5, RootStringSize (no root string)
        out.set(f, p);
        return out;
    }

    async function save(zip, o) {
        return zip.generateAsync({ type: (o && o.type) || 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 },
            mimeType: (o && o.mime) || undefined });
    }

    /** [Content_Types].xml with a Default for this extension. */
    async function contentDefault(zip, ext, type) {
        const n = '[Content_Types].xml';
        let x = await zip.file(n).async('string');
        if (new RegExp('Extension="' + ext + '"', 'i').test(x)) return;
        x = x.replace(/<Types([^>]*)>/, '<Types$1><Default Extension="' + ext + '" ContentType="' + type + '"/>');
        zip.file(n, x);
    }

    /** The next free rId of a relationships part. */
    function nextId(rels) {
        let n = 0;
        rels.replace(/Id="rId(\d+)"/g, function (_, d) { n = Math.max(n, +d); });
        return function () { n += 1; return 'rId' + n; };
    }

    function openRoot(xml, tag) {
        // a self-closing root («<w:fonts …/>») is opened so children can go in
        return xml.replace(new RegExp('<' + tag + '((?:\\s[^>]*?)?)\\s*/>'), '<' + tag + '$1></' + tag + '>');
    }

    async function docx(file, fonts, o) {
        const JSZip = zipLib(), zip = await JSZip.loadAsync(file), guid = (o && o.guid) || newGuid;
        const FT = 'word/fontTable.xml', FR = 'word/_rels/fontTable.xml.rels';
        if (!zip.file(FT)) {
            zip.file(FT, '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:fonts xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="' + NS_R + '"/>');
            const ct = await zip.file('[Content_Types].xml').async('string');
            zip.file('[Content_Types].xml', ct.replace('</Types>', '<Override PartName="/word/fontTable.xml" ContentType="' + CT_FONT_TABLE + '"/></Types>'));
            const DR = 'word/_rels/document.xml.rels';
            const dr = await zip.file(DR).async('string');
            zip.file(DR, dr.replace('</Relationships>', '<Relationship Id="' + nextId(dr)() + '" Type="' + REL_FONT_TABLE + '" Target="fontTable.xml"/></Relationships>'));
        }
        let ft = openRoot(await zip.file(FT).async('string'), 'w:fonts');
        if (!/xmlns:r=/.test(ft.slice(0, ft.indexOf('>', ft.indexOf('<w:fonts'))))) ft = ft.replace('<w:fonts', '<w:fonts xmlns:r="' + NS_R + '"');
        let rels = zip.file(FR) ? await zip.file(FR).async('string') : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>';
        rels = openRoot(rels, 'Relationships');
        const id = nextId(rels);
        let n = 0, embedded = 0, added = '', newRels = '';
        fonts.forEach(function (f) {
            const name = esc(f.name);
            ft = ft.replace(new RegExp('<w:font w:name="' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"(?:\\s*/>|>[\\s\\S]*?</w:font>)'), '');
            let el = '<w:font w:name="' + name + '">';
            if (f.charset != null) el += '<w:charset w:val="' + ((f.charset & 255) < 16 ? '0' : '') + (f.charset & 255).toString(16).toUpperCase() + '"/>';
            FACES.forEach(function (face) {
                const data = f[face[0]];
                if (!data) return;
                const key = guid(), rid = id(), target = 'fonts/kelk-font' + (++n) + '.odttf';
                zip.file('word/' + target, obfuscate(data, key));
                newRels += '<Relationship Id="' + rid + '" Type="' + REL_FONT + '" Target="' + target + '"/>';
                el += '<w:' + face[1] + ' r:id="' + rid + '" w:fontKey="' + key + '"/>';
                embedded++;
            });
            added += el + '</w:font>';
        });
        zip.file(FT, ft.replace('</w:fonts>', added + '</w:fonts>'));
        if (embedded) {
            zip.file(FR, rels.replace('</Relationships>', newRels + '</Relationships>'));
            await contentDefault(zip, 'odttf', CT_ODTTF);
            const SE = 'word/settings.xml';
            if (zip.file(SE)) {
                let s = openRoot(await zip.file(SE).async('string'), 'w:settings');
                if (!/<w:embedTrueTypeFonts\b/.test(s)) {
                    const start = s.indexOf('>', s.indexOf('<w:settings')) + 1;
                    let at = start;
                    const re = /<w:([A-Za-z]+)\b[^>]*?(\/>|>[\s\S]*?<\/w:\1>)/g;
                    re.lastIndex = start;
                    let m;
                    while ((m = re.exec(s)) && SETTINGS_BEFORE.indexOf(m[1]) >= 0) at = re.lastIndex;
                    s = s.slice(0, at) + '<w:embedTrueTypeFonts/>' + s.slice(at);
                }
                zip.file(SE, s);
            }
        }
        return save(zip, Object.assign({ mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }, o));
    }

    async function pptx(file, fonts, o) {
        const JSZip = zipLib(), zip = await JSZip.loadAsync(file);
        const P = 'ppt/presentation.xml', PR = 'ppt/_rels/presentation.xml.rels';
        let pres = await zip.file(P).async('string'), rels = await zip.file(PR).async('string');
        const id = nextId(rels);
        let n = 0, list = '', newRels = '';
        fonts.forEach(function (f) {
            const faces = FACES.filter(function (face) { return f[face[0]]; });
            if (!faces.length) return;
            const cs = f.charset == null ? 0 : (f.charset > 127 ? f.charset - 256 : f.charset);   // xsd:byte
            list += '<p:embeddedFont><p:font typeface="' + esc(f.name) + '" charset="' + cs + '"/>';
            faces.forEach(function (face) {
                const rid = id(), target = 'fonts/kelk-font' + (++n) + '.fntdata';
                zip.file('ppt/' + target, eot(f[face[0]], f.charset));
                newRels += '<Relationship Id="' + rid + '" Type="' + REL_FONT + '" Target="' + target + '"/>';
                list += '<p:' + face[0] + ' r:id="' + rid + '"/>';
            });
            list += '</p:embeddedFont>';
        });
        if (!n) return save(zip, o);
        if (/<p:embeddedFontLst>/.test(pres)) pres = pres.replace('</p:embeddedFontLst>', list + '</p:embeddedFontLst>');
        else {
            const m = /<p:notesSz\b[^>]*?(\/>|>[\s\S]*?<\/p:notesSz>)/.exec(pres);
            if (!m) throw new Error('FontEmbed: no p:notesSz in presentation.xml');
            const at = m.index + m[0].length;
            pres = pres.slice(0, at) + '<p:embeddedFontLst>' + list + '</p:embeddedFontLst>' + pres.slice(at);
        }
        pres = pres.replace(/<p:presentation\b[^>]*>/, function (tag) {
            tag = tag.replace(/\s(embedTrueTypeFonts|saveSubsetFonts)="[^"]*"/g, '');
            return tag.replace(/(\/?>)$/, ' embedTrueTypeFonts="1"$1');
        });
        zip.file(P, pres);
        zip.file(PR, rels.replace('</Relationships>', newRels + '</Relationships>'));
        await contentDefault(zip, 'fntdata', CT_FNTDATA);
        return save(zip, Object.assign({ mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }, o));
    }

    const api = { docx: docx, pptx: pptx, obfuscate: obfuscate, eot: eot, newGuid: newGuid };
    root.FontEmbed = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
