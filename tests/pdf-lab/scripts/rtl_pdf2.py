# A second small PDF writer for the lab's hand-built files (make-fonts29-rtl.py, make-lines29-rtl.py), beside rtl_pdf.py
# (whose shaper and line order it reuses). What it adds:
#   · any TrueType font as a Type0 / Identity-H subset (rtl_pdf.Font), its ToUnicode ours to set wrong on purpose;
#   · Renum: a simple TrueType font as a print driver writes it — one-byte codes numbered from 33 in the order the glyphs
#     are first used (32 the space), the font program with a (1,0) cmap only and no glyph names, no /Encoding and no
#     /ToUnicode: nothing in the file says which letter a code is, only the outlines do;
#   · text in a base-14 font (Helvetica, WinAnsi), a fill colour and a render mode per run, link annotations.
# The Info dictionary holds Producer, Creator and Title only (no author, no dates): lab files carry no personal metadata.
import io, os, zlib
from fontTools.ttLib import TTFont, newTable
from fontTools.ttLib.tables._c_m_a_p import CmapSubtable
import rtl_pdf
from rtl_pdf import Font, visual, LAB

def brackets(gl):
    """right-to-left lines: a bracket inside an Arabic token is drawn mirrored and named logically, as Word does
    (rtl_pdf.visual does it for a closing bracket at a word's end only)"""
    return [((0x29, n) if (c, n) == (0x28, '(') else (0x28, n) if (c, n) == (0x29, ')') else (c, n)) for c, n in gl]

class Renum:
    """a Font drawn through one-byte codes in order of first use; names: None (no ToUnicode) or a function glyph id →
    the text the file's ToUnicode gives that glyph"""
    def __init__(self, font, names=None):
        self.f, self.code, self.names = font, {}, names
        self.ps, self.upem, self.space = font.ps, font.upem, font.space
    def gid(self, c): return self.f.gid(c)
    def adv(self, c, size): return self.f.adv(c, size)
    def byte(self, c):
        g = self.f.gid(c)
        if c == 0x20: self.code.setdefault(g, 32)
        if g not in self.code: self.code[g] = 33 + sum(1 for v in self.code.values() if v != 32)
        assert self.code[g] < 256, 'more than 223 glyphs in one renumbered font'
        return self.code[g]
    def program(self):
        t = rtl_pdf.fixed(TTFont(io.BytesIO(self.f.bytes))); order = t.getGlyphOrder()
        sub = CmapSubtable.newSubtable(6); sub.platformID, sub.platEncID, sub.language = 1, 0, 0
        sub.cmap = {code: order[g] for g, code in self.code.items()}
        cm = newTable('cmap'); cm.tableVersion = 0; cm.tables = [sub]; t['cmap'] = cm
        t['post'].formatType = 3.0; t['post'].extraNames = []; t['post'].mapping = {}
        for k in ('GSUB', 'GPOS', 'GDEF'):
            if k in t: del t[k]
        buf = io.BytesIO(); t.save(buf); return buf.getvalue()

class Doc2:
    def __init__(self, fonts, w=595.28, h=841.89, lang='fa-IR'):
        self.fonts, self.w, self.h, self.lang, self.pages, self.links = fonts, w, h, lang, {}, []
    def op(self, page, s): self.pages.setdefault(page, []).append(s)
    def width(self, gl, size, f): return sum(self.fonts[f].adv(c, size) for c, _ in gl)
    def put(self, page, gl, x, y, size, f, extra=0.0, color=None, mode=None):
        F = self.fonts[f]; pre = (color + ' ' if color else '') + ('%d Tr ' % mode if mode is not None else '')
        for c, n in gl:
            if isinstance(F, Renum): code = '<%02X>' % F.byte(c)
            else:
                g = F.gid(c); F.tounicode.setdefault(g, n); code = '<%04X>' % g
            self.op(page, 'BT %s/%s %.2f Tf 1 0 0 1 %.3f %.3f Tm %s Tj ET' % (pre, f, size, x, y, code))
            x += F.adv(c, size) + (extra if c == 0x20 else 0)
        if color or mode is not None: self.op(page, '0 g 0 Tr')
        return x
    def line(self, page, text, y, size, right, f='F1', justify=None, center=None, ltr=False, gl=None, **kw):
        """a right-to-left line ending at right (or centred on center); ltr: the glyphs in typing order from the left;
        returns (x0, x1)"""
        gl = gl if gl is not None else [(ord(c), c) for c in text] if ltr else brackets(visual(text))
        w = self.width(gl, size, f); n = sum(1 for c, _ in gl if c == 0x20)
        extra = (justify - w) / n if justify and n else 0
        assert extra >= 0, ('line too long for its measure', text, w, justify)
        x0 = center - w / 2 if center is not None else right - w - extra * n
        return x0, self.put(page, gl, x0, y, size, f, extra, **kw)
    def wrap(self, text, size, f, measure):
        out, cur = [], ''
        for wd in text.split(' '):
            t = (cur + ' ' + wd).strip()
            if cur and self.width(brackets(visual(t)), size, f) > measure: out.append(cur); cur = wd
            else: cur = t
        return out + [cur]
    def para(self, page, text, y, size, right, measure, f='F1', lead=1.6, justify=True):
        """a justified paragraph (its last line ragged); returns the y under it"""
        ls = self.wrap(text, size, f, measure)
        for k, l in enumerate(ls):
            self.line(page, l, y, size, right, f, justify=measure if justify and k < len(ls) - 1 else None); y -= size * lead
        return y
    def base14(self, page, text, x, y, size, color='0 g', mode=0):
        esc = text.replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)')
        self.op(page, 'BT %s %d Tr /H %.2f Tf %.2f %.2f Td (%s) Tj ET 0 g 0 Tr' % (color, mode, size, x, y, esc))
    def link(self, page, x0, y0, x1, y1, uri): self.links.append((page, x0, y0, x1, y1, uri))
    def write(self, path, producer, title):
        objs = []
        def obj(b): objs.append(b if isinstance(b, bytes) else b.encode()); return len(objs)
        def stream(data, extra=''):
            z = zlib.compress(data)
            return b'<< /Length %d /Filter /FlateDecode %s >>\nstream\n' % (len(z), extra.encode()) + z + b'\nendstream'
        u16 = lambda s: ''.join('%04X' % ord(c) for c in s)
        ref = {'H': obj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')}
        for k, F in self.fonts.items():
            src = F.f if isinstance(F, Renum) else F
            bb = src.font['head']; box = tuple(round(v * 1000 / src.upem) for v in (bb.xMin, bb.yMin, bb.xMax, bb.yMax))
            adv = lambda g: round(src.font['hmtx'][src.font.getGlyphName(g)][0] * 1000 / src.upem)
            if isinstance(F, Renum):
                prog = F.program(); ff = obj(stream(prog, '/Length1 %d' % len(prog)))
                desc = obj('<< /Type /FontDescriptor /FontName /%s /Flags 4 /FontBBox [%d %d %d %d] /ItalicAngle 0 /Ascent 928 /Descent -236 /CapHeight 729 /StemV 80 /FontFile2 %d 0 R >>' % ((F.ps,) + box + (ff,)))
                by = {code: g for g, code in F.code.items()}; last = max(by)
                tu = ''
                if F.names:
                    cm = ('/CIDInit /ProcSet findresource begin 12 dict begin begincmap /CMapName /%s def /CMapType 2 def 1 begincodespacerange <20> <FF> endcodespacerange\n'
                          '%d beginbfchar\n%s\nendbfchar\nendcmap CMapName currentdict /CMap defineresource pop end end') % (
                          F.ps, len(by), '\n'.join('<%02X> <%s>' % (c, u16(F.names(by[c]))) for c in sorted(by)))
                    tu = ' /ToUnicode %d 0 R' % obj(stream(cm.encode()))
                ref[k] = obj('<< /Type /Font /Subtype /TrueType /BaseFont /%s /FirstChar 32 /LastChar %d /Widths [%s] /FontDescriptor %d 0 R%s >>'
                             % (F.ps, last, ' '.join(str(adv(by[c])) if c in by else '0' for c in range(32, last + 1)), desc, tu))
                continue
            F.tounicode.setdefault(F.gid(0x20), ' ')
            ff = obj(stream(F.bytes, '/Length1 %d' % len(F.bytes)))
            desc = obj('<< /Type /FontDescriptor /FontName /%s /Flags 32 /FontBBox [%d %d %d %d] /ItalicAngle 0 /Ascent 928 /Descent -236 /CapHeight 729 /StemV 80 /FontFile2 %d 0 R >>' % ((F.ps,) + box + (ff,)))
            cid = obj('<< /Type /Font /Subtype /CIDFontType2 /BaseFont /%s /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor %d 0 R /CIDToGIDMap /Identity /W [%s] >>'
                      % (F.ps, desc, ' '.join('%d [%d]' % (g, adv(g)) for g in sorted(F.tounicode))))
            cm = ('/CIDInit /ProcSet findresource begin 12 dict begin begincmap /CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def '
                  '/CMapName /Adobe-Identity-UCS def /CMapType 2 def 1 begincodespacerange <0000> <FFFF> endcodespacerange\n%d beginbfchar\n%s\nendbfchar\n'
                  'endcmap CMapName currentdict /CMap defineresource pop end end') % (len(F.tounicode), '\n'.join('<%04X> <%s>' % (g, u16(t)) for g, t in sorted(F.tounicode.items())))
            tu = obj(stream(cm.encode()))
            ref[k] = obj('<< /Type /Font /Subtype /Type0 /BaseFont /%s /Encoding /Identity-H /DescendantFonts [%d 0 R] /ToUnicode %d 0 R >>' % (F.ps, cid, tu))
        res = ' '.join('/%s %d 0 R' % kv for kv in ref.items())
        np = max(self.pages); nlinks = len(self.links)
        pages_id = len(objs) + nlinks + 2 * np + 1
        annots = {}
        for (p, x0, y0, x1, y1, uri) in self.links:
            annots.setdefault(p, []).append(obj('<< /Type /Annot /Subtype /Link /Rect [%.2f %.2f %.2f %.2f] /Border [0 0 0] /A << /S /URI /URI (%s) >> >>' % (x0, y0, x1, y1, uri)))
        kids = []
        for p in range(1, np + 1):
            c = obj(stream('\n'.join(self.pages.get(p, [])).encode()))
            kids.append(obj('<< /Type /Page /Parent %d 0 R /MediaBox [0 0 %g %g] /Resources << /Font << %s >> >> /Contents %d 0 R /Annots [%s] >>'
                            % (pages_id, self.w, self.h, res, c, ' '.join('%d 0 R' % a for a in annots.get(p, [])))))
        assert obj('<< /Type /Pages /Kids [%s] /Count %d >>' % (' '.join('%d 0 R' % k for k in kids), np)) == pages_id
        cat = obj('<< /Type /Catalog /Pages %d 0 R /Lang (%s) >>' % (pages_id, self.lang))
        info = obj(b'<< /Producer (' + producer + b') /Creator (' + producer + b') /Title (' + title.encode() + b') >>')
        out = io.BytesIO(); out.write(b'%PDF-1.7\n%\xe2\xe3\xcf\xd3\n'); offs = []
        for i, b in enumerate(objs):
            offs.append(out.tell()); out.write(b'%d 0 obj\n' % (i + 1) + b + b'\nendobj\n')
        x = out.tell()
        out.write(b'xref\n0 %d\n0000000000 65535 f \n' % (len(objs) + 1) + b''.join(b'%010d 00000 n \n' % o for o in offs))
        out.write(b'trailer\n<< /Size %d /Root %d 0 R /Info %d 0 R >>\nstartxref\n%d\n%%%%EOF\n' % (len(objs) + 1, cat, info, x))
        open(path, 'wb').write(out.getvalue())
        print(os.path.relpath(path, LAB), len(out.getvalue()), 'bytes')

# The hidden-text block (Kelk 2.9): text the file holds and no reader sees, given at the document's end in the page's
# language — a GitHub alert, then each piece as a code block under its page and reason.
HIDDEN = {
    'fa': ('> [!WARNING]\n> **متن پنهان (hidden text)**: این بخش متنی است که در فایل هست ولی هنگام نمایش دیده نمی‌شود. آن را بررسی کنید و در '
           'بیشتر موارد حذف کنید؛ چنین متنی می‌تواند برای ابزارهای هوش مصنوعی دستور پنهان (prompt injection) باشد.\n',
           'صفحهٔ %d — %s:', {'off': 'بیرون از صفحه', 'white': 'سفید روی سفید', 'tiny': 'بسیار ریز', 'invisible': 'نامریی'}),
    'en': ('> [!WARNING]\n> **Hidden text**: this part is text that exists in the file but is not shown when the file is viewed. Check it and in '
           'most cases delete it; such text can act as a hidden instruction for AI tools (prompt injection).\n',
           'Page %d — %s:', {'off': 'off the page', 'white': 'white on white', 'tiny': 'too small to read', 'invisible': 'invisible'}),
}
def hidden_md(lang, items):
    """items: [(page, reason key, text)] → the block's Markdown"""
    head, label, why = HIDDEN[lang]
    q = lambda lines: '\n'.join('> ' + l if l else '>' for l in lines) + '\n'
    return head + ''.join(q(['', label % (p, why[r]), '', '```text'] + t.split('\n') + ['```']) for p, r, t in items)
