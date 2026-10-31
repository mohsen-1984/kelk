# Shared helpers for the lab's hand-built right-to-left PDFs (make-plan-rtl.py, make-itext-rtl.py): DejaVu Sans
# subsets, a simple shaper (presentation forms; ToUnicode names base letters), a right-to-left line laid out left to
# right, and a tiny PDF writer (Type0 / Identity-H fonts, a box picture, Info).
import os, io, zlib
from fontTools.ttLib import TTFont
from fontTools import subset

LAB = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
REG = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'

FORMS = {
 'ا': 'FE8D FE8E', 'آ': 'FE81 FE82', 'ب': 'FE8F FE90 FE91 FE92', 'پ': 'FB56 FB57 FB58 FB59', 'ت': 'FE95 FE96 FE97 FE98',
 'ج': 'FE9D FE9E FE9F FEA0', 'چ': 'FB7A FB7B FB7C FB7D', 'ح': 'FEA1 FEA2 FEA3 FEA4', 'خ': 'FEA5 FEA6 FEA7 FEA8',
 'د': 'FEA9 FEAA', 'ر': 'FEAD FEAE', 'ز': 'FEAF FEB0', 'ژ': 'FB8A FB8B', 'س': 'FEB1 FEB2 FEB3 FEB4', 'ش': 'FEB5 FEB6 FEB7 FEB8',
 'ص': 'FEB9 FEBA FEBB FEBC', 'ط': 'FEC1 FEC2 FEC3 FEC4', 'ع': 'FEC9 FECA FECB FECC', 'ف': 'FED1 FED2 FED3 FED4',
 'ق': 'FED5 FED6 FED7 FED8', 'ک': 'FB8E FB8F FB90 FB91', 'گ': 'FB92 FB93 FB94 FB95', 'ل': 'FEDD FEDE FEDF FEE0',
 'م': 'FEE1 FEE2 FEE3 FEE4', 'ن': 'FEE5 FEE6 FEE7 FEE8', 'ه': 'FEE9 FEEA FEEB FEEC', 'و': 'FEED FEEE',
 'ی': 'FBFC FBFD FBFE FBFF', 'ذ': 'FEAB FEAC', 'ض': 'FEBD FEBE FEBF FEC0', 'غ': 'FECD FECE FECF FED0', 'ظ': 'FEC5 FEC6 FEC7 FEC8',
 'ث': 'FE99 FE9A FE9B FE9C', 'ئ': 'FE89 FE8A FE8B FE8C', 'أ': 'FE83 FE84',
}
FORMS = {k: [int(h, 16) for h in v.split()] for k, v in FORMS.items()}
DUAL = {k for k, v in FORMS.items() if len(v) == 4}
ZWNJ = '‌'

def shape(word):
    """logical word → [(code drawn, ToUnicode text)] in logical order (base letters named, ZWNJ not drawn)"""
    out, i = [], 0
    while i < len(word):
        c = word[i]
        if c == ZWNJ: i += 1; continue
        if c not in FORMS: out.append((ord(c), c)); i += 1; continue
        prev = word[i - 1] if i else ''
        joins_prev = prev in DUAL
        if c == 'ل' and i + 1 < len(word) and word[i + 1] == 'ا':
            out.append((0xFEFC if joins_prev else 0xFEFB, 'لا')); i += 2; continue
        nxt = word[i + 1] if i + 1 < len(word) else ''
        joins_next = c in DUAL and nxt in FORMS
        f = FORMS[c]
        out.append((f[3] if joins_prev and joins_next else f[1] if joins_prev else f[2] if joins_next else f[0], c))
        i += 1
    return out

CODES = {c for v in FORMS.values() for c in v} | {ord(c) for c in FORMS} | {ord(c) for c in '0123456789 .:/-،؛…()'} | \
        {0x2013, 0x2611, 0xFEFB, 0xFEFC}

class Font:
    def __init__(self, path, ps):
        src = TTFont(path); cm = src.getBestCmap()
        opts = subset.Options(); opts.layout_features = []; opts.notdef_outline = True; opts.name_IDs = ['*']; opts.glyph_names = True
        sub = subset.Subsetter(opts); sub.populate(unicodes=sorted(c for c in CODES if c in cm)); sub.subset(src)
        buf = io.BytesIO(); src.save(buf); self.bytes = buf.getvalue()
        self.ps, self.font = ps, TTFont(io.BytesIO(self.bytes))
        self.cmap, self.upem = self.font.getBestCmap(), self.font['head'].unitsPerEm
        self.tounicode = {}
        self.space = None                     # a space's advance (em) other than the font's own
    def gid(self, code): return self.font.getGlyphID(self.cmap[code])
    def adv(self, code, size):
        if code == 0x20 and self.space is not None: return self.space * size
        return self.font['hmtx'][self.cmap[code]][0] * size / self.upem

def is_ar(t): return any('؀' <= c <= 'ۿ' for c in t)
def visual(text):
    """one right-to-left line → [(code, name)] left to right: tokens reversed, Arabic ones shaped and reversed, numbers
    kept left to right; a token's trailing ، . : ؛ shows at its left"""
    items = []
    for t in text.split(' '):
        tail = ''
        while t and len(t) > 1 and (t[-1] in '،.:؛-' or (t[-1] == ')' and '(' not in t)): tail = t[-1] + tail; t = t[:-1]
        items.append(('t', t));
        for c in tail: items.append(('p', c))
        items.append(('s', ' '))
    if items and items[-1][0] == 's': items.pop()
    out = []
    for kind, t in reversed(items):
        if kind == 's': out.append((0x20, ' '))
        elif kind == 'p': out.append((ord('(') if t == ')' else ord(t), t))   # (a closing bracket at a word's end: its shape mirrored, named logically — Word's)
        elif is_ar(t): out.extend(reversed(shape(t)))
        else: out.extend((ord(c), c) for c in t)
    return out

class Doc:
    def __init__(self, fonts, w=595.28, h=841.89):
        self.fonts, self.w, self.h, self.pages, self.images = fonts, w, h, {}, []
        self.ghosts = []                      # (page, x, y, w, h): a picture its soft mask hides throughout
    def op(self, page, s): self.pages.setdefault(page, []).append(s)
    def width(self, gl, size, f): return sum(self.fonts[f].adv(c, size) for c, _ in gl)
    def put(self, page, gl, x, y, size, f, extra=0.0, skip=()):
        F = self.fonts[f]
        for k, (c, n) in enumerate(gl):
            if k not in skip:
                g = F.gid(c); F.tounicode.setdefault(g, n)
                self.op(page, 'BT /%s %.2f Tf 1 0 0 1 %.3f %.3f Tm <%04X> Tj ET' % (f, size, x, y, g))
            x += F.adv(c, size) + (extra if c == 0x20 else 0)
        return x
    def line(self, page, text, y, size, right, f='F1', justify=None, skip=()):
        gl = visual(text); w = self.width(gl, size, f)
        n = sum(1 for c, _ in gl if c == 0x20)
        extra = (justify - w) / n if justify and n else 0
        assert extra >= 0, ('line too long for its measure', text, w, justify)
        x0 = right - w - extra * n
        self.put(page, gl, x0, y, size, f, extra, skip)
        return x0
    def runs(self, page, parts, y, size, right):
        """a line of runs (text, font) from the right; ('pic', w) a box picture's room; ('gap', w) room without glyphs"""
        x = right
        for t, f in parts:
            if t == 'pic': x -= f; self.box(page, x, y - 3, f, 14.4); continue
            if t == 'gap': x -= f; continue
            gl = visual(t); w = self.width(gl, size, f); x -= w
            self.put(page, gl, x, y, size, f)
        return x
    def box(self, page, x, y, w, h):
        # a picture wider than its box: the box drawn in its left 10.5 pt, the rest clear — over the label's letters
        self.images.append((page, x, y, w + 7, h))
    def write(self, path, producer, title):
        objs = []
        def obj(b): objs.append(b); return len(objs)
        def stream(data, extra=''):
            z = zlib.compress(data)
            return b'<< /Length %d /Filter /FlateDecode %s >>\nstream\n' % (len(z), extra.encode()) + z + b'\nendstream'
        u16 = lambda s: ''.join('%04X' % ord(c) for c in s)
        fontref = {}
        for k, F in self.fonts.items():
            F.tounicode.setdefault(F.gid(0x20), ' ')
            ff = obj(stream(F.bytes, '/Length1 %d' % len(F.bytes)))
            bb = F.font['head']
            box = tuple(round(v * 1000 / F.upem) for v in (bb.xMin, bb.yMin, bb.xMax, bb.yMax))
            desc = obj(('<< /Type /FontDescriptor /FontName /%s /Flags 32 /FontBBox [%d %d %d %d] /ItalicAngle 0 /Ascent 928 /Descent -236 '
                        '/CapHeight 729 /StemV 80 /FontFile2 %d 0 R >>' % ((F.ps,) + box + (ff,))).encode())
            widths = ' '.join('%d [%d]' % (g, round((F.space * 1000 if (F.space is not None and F.font.getGlyphName(g) == 'space') else F.font['hmtx'][F.font.getGlyphName(g)][0] * 1000 / F.upem))) for g in sorted(F.tounicode))
            cid = obj(('<< /Type /Font /Subtype /CIDFontType2 /BaseFont /%s /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> '
                       '/FontDescriptor %d 0 R /CIDToGIDMap /Identity /W [%s] >>' % (F.ps, desc, widths)).encode())
            cm = ('/CIDInit /ProcSet findresource begin 12 dict begin begincmap /CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def '
                  '/CMapName /Adobe-Identity-UCS def /CMapType 2 def 1 begincodespacerange <0000> <FFFF> endcodespacerange\n%d beginbfchar\n%s\nendbfchar\n'
                  'endcmap CMapName currentdict /CMap defineresource pop end end') % (len(F.tounicode), '\n'.join('<%04X> <%s>' % (g, u16(t)) for g, t in sorted(F.tounicode.items())))
            tu = obj(stream(cm.encode()))
            fontref[k] = obj(('<< /Type /Font /Subtype /Type0 /BaseFont /%s /Encoding /Identity-H /DescendantFonts [%d 0 R] /ToUnicode %d 0 R >>' % (F.ps, cid, tu)).encode())
        # the box picture: 35 × 24 pixels, a black square outline in its left part, white elsewhere
        pw, ph = 35, 24
        px = bytearray()
        for yy in range(ph):
            for xx in range(pw):
                edge = (2 <= xx <= 19 and yy in (3, 20)) or (xx in (2, 19) and 3 <= yy <= 20)
                px += b'\x00\x00\x00' if edge else b'\xff\xff\xff'
        img = obj(stream(bytes(px), '/Type /XObject /Subtype /Image /Width %d /Height %d /ColorSpace /DeviceRGB /BitsPerComponent 8' % (pw, ph)))
        # the ghost picture: 43 × 57 pixels, black, under a soft mask of zeros — drawn, and showing nothing
        gw, gh = 43, 57
        gmask = obj(stream(bytes(gw * gh), '/Type /XObject /Subtype /Image /Width %d /Height %d /ColorSpace /DeviceGray /BitsPerComponent 8' % (gw, gh)))
        ghost = obj(stream(bytes(3 * gw * gh), '/Type /XObject /Subtype /Image /Width %d /Height %d /ColorSpace /DeviceRGB /BitsPerComponent 8 /SMask %d 0 R' % (gw, gh, gmask)))
        np = max(self.pages)
        pages_id = len(objs) + 2 * np + 1
        kids = []
        res = ' '.join('/%s %d 0 R' % (k, v) for k, v in fontref.items())
        for p in range(1, np + 1):
            body = list(self.pages.get(p, []))
            for (q, x, y, w, h) in self.images:
                if q == p: body.append('q %.2f 0 0 %.2f %.2f %.2f cm /Im1 Do Q' % (w, h, x, y))
            for (q, x, y, w, h) in self.ghosts:
                if q == p: body.append('q %.2f 0 0 %.2f %.2f %.2f cm /Im2 Do Q' % (w, h, x, y))
            c = obj(stream('\n'.join(body).encode()))
            kids.append(obj(('<< /Type /Page /Parent %d 0 R /MediaBox [0 0 %g %g] /Resources << /Font << %s >> /XObject << /Im1 %d 0 R /Im2 %d 0 R >> >> /Contents %d 0 R >>' % (pages_id, self.w, self.h, res, img, ghost, c)).encode()))
        assert obj(('<< /Type /Pages /Kids [%s] /Count %d >>' % (' '.join('%d 0 R' % k for k in kids), np)).encode()) == pages_id
        cat = obj(('<< /Type /Catalog /Pages %d 0 R /Lang (fa-IR) >>' % pages_id).encode())
        info = obj(b'<< /Producer (' + producer + b') /Creator (' + producer + b') /Title (' + title.encode() + b') >>')
        out = io.BytesIO(); out.write(b'%PDF-1.7\n%\xe2\xe3\xcf\xd3\n'); offs = []
        for i, b in enumerate(objs):
            offs.append(out.tell()); out.write(b'%d 0 obj\n' % (i + 1) + b + b'\nendobj\n')
        x = out.tell()
        out.write(b'xref\n0 %d\n0000000000 65535 f \n' % (len(objs) + 1) + b''.join(b'%010d 00000 n \n' % o for o in offs))
        out.write(b'trailer\n<< /Size %d /Root %d 0 R /Info %d 0 R >>\nstartxref\n%d\n%%%%EOF\n' % (len(objs) + 1, cat, info, x))
        open(path, 'wb').write(out.getvalue())
        print(os.path.relpath(path, LAB), len(out.getvalue()), 'bytes')

