# A Persian slide deck as PowerPoint exports it with a legacy Persian font — built by hand, glyph by glyph, so each
# habit is in it on purpose:
#   · the ToUnicode is one entry off for a few glyphs (the font's own cmap is right): the space glyph is named «ً»,
#     the «ً» glyph (no advance) is named «ا», the final lam-alef «ﻼ» is named «ل» — every word gap read «ً»,
#     «السلام» read «السل‌م»
#   · slide 1: a paragraph drawn without space glyphs (its words apart by gaps) above one drawn with them; in the
#     second, a wrapped line's space is drawn at the line's far (left) end and its room between the words left empty
#   · slide 2: an agenda centred on an axis of its own, left of a picture (a grey panel): lines of very different
#     lengths, short plain labels over bold items (it read as a quote); its last item ends without a full stop and the
#     next slide starts with a short line (it ran on into the next slide's title)
#   · slide 3: a link to an attached file whose name is Persian, written as UTF-8 bytes in the PDF string (pdf.js reads
#     one byte a character: «Attach/Ø¨Ø±Ù……»)
# The Markdown that must come back is corpus/slides-rtl.md.
#   python3 scripts/make-slides-rtl.py      → pdf/pptx-rtl--slides-rtl.pdf, corpus/slides-rtl.md
import os, io, zlib
from fontTools.ttLib import TTFont
from fontTools import subset

LAB = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
REG = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
W, H = 720.0, 405.0

FORMS = {
 'ا': 'FE8D FE8E', 'آ': 'FE81 FE82', 'ب': 'FE8F FE90 FE91 FE92', 'پ': 'FB56 FB57 FB58 FB59', 'ت': 'FE95 FE96 FE97 FE98',
 'ج': 'FE9D FE9E FE9F FEA0', 'چ': 'FB7A FB7B FB7C FB7D', 'ح': 'FEA1 FEA2 FEA3 FEA4', 'خ': 'FEA5 FEA6 FEA7 FEA8',
 'د': 'FEA9 FEAA', 'ر': 'FEAD FEAE', 'ز': 'FEAF FEB0', 'س': 'FEB1 FEB2 FEB3 FEB4', 'ش': 'FEB5 FEB6 FEB7 FEB8',
 'ص': 'FEB9 FEBA FEBB FEBC', 'ط': 'FEC1 FEC2 FEC3 FEC4', 'ع': 'FEC9 FECA FECB FECC', 'ف': 'FED1 FED2 FED3 FED4',
 'ق': 'FED5 FED6 FED7 FED8', 'ک': 'FB8E FB8F FB90 FB91', 'گ': 'FB92 FB93 FB94 FB95', 'ل': 'FEDD FEDE FEDF FEE0',
 'م': 'FEE1 FEE2 FEE3 FEE4', 'ن': 'FEE5 FEE6 FEE7 FEE8', 'ه': 'FEE9 FEEA FEEB FEEC', 'و': 'FEED FEEE',
 'ی': 'FBFC FBFD FBFE FBFF', 'ذ': 'FEAB FEAC', 'ض': 'FEBD FEBE FEBF FEC0', 'غ': 'FECD FECE FECF FED0', 'ئ': 'FE89 FE8A FE8B FE8C',
}
FORMS = {k: [int(h, 16) for h in v.split()] for k, v in FORMS.items()}
DUAL = {k for k, v in FORMS.items() if len(v) == 4}
ZWNJ, FATHATAN = '‌', 'ً'

def shape(word):
    """logical word → [(code drawn, ToUnicode text)] in logical order (PowerPoint's names: one entry off for the space,
    «ً» and the final lam-alef — the rest by their base letter)"""
    out, i = [], 0
    while i < len(word):
        c = word[i]
        if c == ZWNJ: i += 1; continue                       # not drawn: the shapes show it
        if c == FATHATAN: out.append((0x64B, 'ا')); i += 1; continue
        if c not in FORMS: out.append((ord(c), c)); i += 1; continue
        prev = word[i - 1] if i else ''
        joins_prev = prev in DUAL
        if c == 'ل' and i + 1 < len(word) and word[i + 1] == 'ا':
            out.append((0xFEFC, 'ل') if joins_prev else (0xFEFB, 'لا')); i += 2; continue
        nxt = word[i + 1] if i + 1 < len(word) else ''
        joins_next = c in DUAL and nxt in FORMS
        f = FORMS[c]
        out.append((f[3] if joins_prev and joins_next else f[1] if joins_prev else f[2] if joins_next else f[0], c))
        i += 1
    return out

# the font subset to what the deck draws (all forms of its letters, digits, signs)
CODES = {c for v in FORMS.values() for c in v} | {ord(c) for c in FORMS} | {ord(c) for c in '0123456789 .،'} | {0x64B, 0xFEFB, 0xFEFC}

class Font:
    def __init__(self, key, path, ps):
        src = TTFont(path); cm = src.getBestCmap()
        opts = subset.Options(); opts.layout_features = []; opts.notdef_outline = True; opts.name_IDs = ['*']; opts.glyph_names = True
        sub = subset.Subsetter(opts); sub.populate(unicodes=sorted(c for c in CODES if c in cm)); sub.subset(src)
        buf = io.BytesIO(); src.save(buf); self.bytes = buf.getvalue()
        self.key, self.ps, self.font = key, ps, TTFont(io.BytesIO(self.bytes))
        self.cmap, self.upem = self.font.getBestCmap(), self.font['head'].unitsPerEm
        self.tounicode = {}
    def gid(self, code): return self.font.getGlyphID(self.cmap[code])
    def adv(self, code, size): return 0 if code == 0x64B else self.font['hmtx'][self.cmap[code]][0] * size / self.upem
FONTS = {'F1': Font('F1', REG, 'AAAAAA+LegacyNaskh'), 'F2': Font('F2', BOLD, 'AAAAAB+LegacyNaskhBold')}

def visual(text):
    """one right-to-left line → [(code, name)] left to right (digits kept left to right)"""
    words = text.split(' ')
    items = []
    for k, w in enumerate(words):
        if w.isdigit(): items.append([(ord(c), c) for c in w])
        else: items.append(list(reversed(shape(w))))
    out = []
    for k, it in enumerate(reversed(items)):
        if k: out.append((32, 'ً'))
        out.extend(it)
    return out

ops = {1: [], 2: [], 3: []}
def put(page, gl, x, y, size, f='F1', spaces=True, far_space=None):
    """glyphs left to right from x; spaces=False: a gap of the space's width, no glyph"""
    F = FONTS[f]
    for code, name in gl:
        a = F.adv(code, size)
        if code == 32 and not spaces: x += a; continue
        g = F.gid(code); F.tounicode.setdefault(g, name)
        ops[page].append('BT /%s %.2f Tf 1 0 0 1 %.3f %.3f Tm <%04X> Tj ET' % (f, size, x, y, g))
        x += a
    if far_space is not None:                       # the wrapped line's space, drawn at its far end
        g = F.gid(32); ops[page].append('BT /%s %.2f Tf 1 0 0 1 %.3f %.3f Tm <%04X> Tj ET' % (f, size, far_space, y, g))
def width(gl, size, f='F1'): return sum(FONTS[f].adv(c, size) for c, _ in gl)
def line(page, text, y, size, align, f='F1', spaces=True, wrap_last=False):
    gl = visual(text)
    w = width(gl, size, f)
    x = align[1] - w if align[0] == 'r' else align[1] - w / 2
    if wrap_last:
        # the space between the line's last two words (logically) left as room; one drawn at the far left instead
        i = next(k for k, (c, _) in enumerate(gl) if c == 32)
        put(page, gl[:i], x, y, size, f); put(page, gl[i + 1:], x + width(gl[:i + 1], size, f), y, size, f)
        put(page, [], 0, y, size, f, far_space=x - FONTS[f].adv(32, size))
        return
    put(page, gl, x, y, size, f, spaces)

R = 680
# slide 1
line(1, 'نشست هفتگی گروه', 350, 26, ('c', 360), 'F2')
for k, t in enumerate(['اصلاً هدف این نشست مرور کارهای هفته است. همه گروه‌ها', 'گزارش کوتاهی از کار خود می‌دهند و السلام.']):
    line(1, t, 290 - 26 * k, 18, ('r', R), spaces=False)
for k, t in enumerate(['برنامه‌ها باید پیش از نشست آماده شوند تا وقت', 'همه اعضا برای گفتگو بماند.']):
    line(1, t, 200 - 26 * k, 18, ('r', R), wrap_last=(k == 0))
# slide 2: the agenda, centred at x = 280, a picture panel at the right
ops[2].append('0.85 g 560 40 140 325 re f 0 g')
AG = [(330, 'پیش دستور', 'F1'), (300, 'اخبار واحدها', 'F2'), (268, 'دستور 1', 'F1'), (238, 'گزارش اجرای برنامه‌های هفته فرهنگ', 'F2'),
      (206, 'دستور 2', 'F1'), (176, 'گزارش درباره بازنگری روش صدور ابلاغ‌ها مطابق آیین‌نامه داخلی واحدها', 'F2')]
for y, t, f in AG: line(2, t, y, 18, ('c', 280), f)
# slide 3
line(3, 'پیش دستور', 300, 20, ('c', 360))
line(3, 'اخبار واحدها', 260, 26, ('c', 360), 'F2')
LINK = 'پیوست برنامه هفته'
gl = visual(LINK); lw = width(gl, 22, 'F2')
line(3, LINK, 200, 22, ('c', 360), 'F2')

EXPECTED = '''# نشست هفتگی گروه

اصلاً هدف این نشست مرور کارهای هفته است. همه گروه‌ها گزارش کوتاهی از کار خود می‌دهند و السلام.

برنامه‌ها باید پیش از نشست آماده شوند تا وقت همه اعضا برای گفتگو بماند.

پیش دستور\\
**اخبار واحدها**

دستور 1\\
**گزارش اجرای برنامه‌های هفته فرهنگ**

دستور 2\\
**گزارش درباره بازنگری روش صدور ابلاغ‌ها مطابق آیین‌نامه داخلی واحدها**

پیش دستور

# اخبار واحدها

## [پیوست برنامه هفته](<Attach/برنامه هفته.pdf>)
'''

# ── the PDF ────────────────────────────────────────────────────────────
objs = []
def obj(body): objs.append(body); return len(objs)
def stream(data, extra=''):
    z = zlib.compress(data)
    return b'<< /Length %d /Filter /FlateDecode %s >>\nstream\n' % (len(z), extra.encode()) + z + b'\nendstream'
def u16(s): return ''.join('%04X' % (ord(c)) for c in s)
fontref = {}
for k, F in FONTS.items():
    F.tounicode.setdefault(F.gid(32), 'ً')
    ff = obj(stream(F.bytes, '/Length1 %d' % len(F.bytes)))
    bb = F.font['head']
    box = tuple(round(v * 1000 / F.upem) for v in (bb.xMin, bb.yMin, bb.xMax, bb.yMax))
    desc = obj(('<< /Type /FontDescriptor /FontName /%s /Flags 32 /FontBBox [%d %d %d %d] /ItalicAngle 0 '
                '/Ascent 928 /Descent -236 /CapHeight 729 /StemV %d /FontFile2 %d 0 R >>' % ((F.ps,) + box + (140 if k == 'F2' else 80, ff))).encode())
    adv = lambda g: 0 if F.font.getGlyphName(g) == 'uni064B' else round(F.font['hmtx'][F.font.getGlyphName(g)][0] * 1000 / F.upem)
    widths = ' '.join('%d [%d]' % (g, adv(g)) for g in sorted(F.tounicode))
    cid = obj(('<< /Type /Font /Subtype /CIDFontType2 /BaseFont /%s /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> '
               '/FontDescriptor %d 0 R /CIDToGIDMap /Identity /W [%s] >>' % (F.ps, desc, widths)).encode())
    cm = ('/CIDInit /ProcSet findresource begin 12 dict begin begincmap /CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def '
          '/CMapName /Adobe-Identity-UCS def /CMapType 2 def 1 begincodespacerange <0000> <FFFF> endcodespacerange\n%d beginbfchar\n%s\nendbfchar\n'
          'endcmap CMapName currentdict /CMap defineresource pop end end') % (len(F.tounicode), '\n'.join('<%04X> <%s>' % (g, u16(t)) for g, t in sorted(F.tounicode.items())))
    tu = obj(stream(cm.encode()))
    fontref[k] = obj(('<< /Type /Font /Subtype /Type0 /BaseFont /%s /Encoding /Identity-H /DescendantFonts [%d 0 R] /ToUnicode %d 0 R >>' % (F.ps, cid, tu)).encode())
# the link: its URI's bytes UTF-8, in a literal string
uri = 'Attach/برنامه هفته.pdf'.encode('utf-8').replace(b'\\', b'\\\\').replace(b'(', b'\\(').replace(b')', b'\\)')
annot = obj(b'<< /Type /Annot /Subtype /Link /Rect [%.2f 194 %.2f 222] /Border [0 0 0] /A << /S /URI /URI (' % (360 - lw / 2, 360 + lw / 2) + uri + b') >> >>')
pages_id = len(objs) + 2 * 3 + 1
kids = []
res = ' '.join('/%s %d 0 R' % (k, v) for k, v in fontref.items())
for p in (1, 2, 3):
    c = obj(stream('\n'.join(ops[p]).encode()))
    an = ' /Annots [%d 0 R]' % annot if p == 3 else ''
    kids.append(obj(('<< /Type /Page /Parent %d 0 R /MediaBox [0 0 %g %g] /Resources << /Font << %s >> >> /Contents %d 0 R%s >>' % (pages_id, W, H, res, c, an)).encode()))
assert obj(('<< /Type /Pages /Kids [%s] /Count 3 >>' % ' '.join('%d 0 R' % k for k in kids)).encode()) == pages_id
cat = obj(('<< /Type /Catalog /Pages %d 0 R /Lang (fa-IR) >>' % pages_id).encode())
info = obj(b'<< /Producer (Microsoft\xae PowerPoint\xae 2016) /Creator (Microsoft\xae PowerPoint\xae 2016) /Title (slides-rtl) >>')
out = io.BytesIO(); out.write(b'%PDF-1.7\n%\xe2\xe3\xcf\xd3\n'); offs = []
for i, b in enumerate(objs):
    offs.append(out.tell()); out.write(b'%d 0 obj\n' % (i + 1) + b + b'\nendobj\n')
x = out.tell()
out.write(b'xref\n0 %d\n0000000000 65535 f \n' % (len(objs) + 1) + b''.join(b'%010d 00000 n \n' % o for o in offs))
out.write(b'trailer\n<< /Size %d /Root %d 0 R /Info %d 0 R >>\nstartxref\n%d\n%%%%EOF\n' % (len(objs) + 1, cat, info, x))
open(os.path.join(LAB, 'pdf', 'producers', 'pptx-rtl--slides-rtl.pdf'), 'wb').write(out.getvalue())
open(os.path.join(LAB, 'corpus', 'slides-rtl.md'), 'w').write(EXPECTED)
print('pdf/pptx-rtl--slides-rtl.pdf', len(out.getvalue()), 'bytes')
