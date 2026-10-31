# A Persian slide deck as PowerPoint exports it in Arial — built by hand, glyph by glyph, so each habit is in it on
# purpose:
#   · the shapes lie about joining back: a right-joining letter after a joining one is drawn with its isolated glyph
#     («مر», «ند»), a medial noon / beh / teh / yeh with the initial glyph; tah has one glyph for all its forms. Its
#     forward join is true: a final yeh before a ZWNJ PowerPoint did not draw shows it («شخصي‌سازي‌شده», «میکند»)
#   · other ZWNJs drawn, as a zero-width glyph named U+200C («داده‌ها»): the file draws some of its ZWNJs
#   · the Latin run in a second subset of the same font name, with no space glyph between its words («Open Data Kit 2»,
#     a third of an em apart), its brackets named by the logical character where its own cmap names the shape
#     («(AI)» — the shape at the left named «)»)
#   · a dot grid beside the paragraph (4 × 8 small discs, PowerPoint's: its last column and one row half a point larger)
#   · slide 2: a title in a rounded frame of its own over a picture, the slide's only text
#   · slide 3: a list with square bullets beside the same grid
# The Markdown that must come back is corpus/deck-arial.md.
#   python3 scripts/make-deck-arial.py      → pdf/pptx-arial--deck-arial.pdf, corpus/deck-arial.md
import os, io, zlib
from fontTools.ttLib import TTFont
from fontTools import subset

LAB = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
REG = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
W, H = 960.0, 540.0

FORMS = {
 'ا': 'FE8D FE8E', 'آ': 'FE81 FE82', 'ب': 'FE8F FE90 FE91 FE92', 'پ': 'FB56 FB57 FB58 FB59', 'ت': 'FE95 FE96 FE97 FE98',
 'ج': 'FE9D FE9E FE9F FEA0', 'چ': 'FB7A FB7B FB7C FB7D', 'ح': 'FEA1 FEA2 FEA3 FEA4', 'خ': 'FEA5 FEA6 FEA7 FEA8',
 'د': 'FEA9 FEAA', 'ر': 'FEAD FEAE', 'ز': 'FEAF FEB0', 'س': 'FEB1 FEB2 FEB3 FEB4', 'ش': 'FEB5 FEB6 FEB7 FEB8',
 'ص': 'FEB9 FEBA FEBB FEBC', 'ط': 'FEC1 FEC2 FEC3 FEC4', 'ظ': 'FEC5 FEC6 FEC7 FEC8', 'ع': 'FEC9 FECA FECB FECC', 'ف': 'FED1 FED2 FED3 FED4',
 'ق': 'FED5 FED6 FED7 FED8', 'ک': 'FB8E FB8F FB90 FB91', 'گ': 'FB92 FB93 FB94 FB95', 'ل': 'FEDD FEDE FEDF FEE0',
 'م': 'FEE1 FEE2 FEE3 FEE4', 'ن': 'FEE5 FEE6 FEE7 FEE8', 'ه': 'FEE9 FEEA FEEB FEEC', 'و': 'FEED FEEE',
 'ی': 'FBFC FBFD FBFE FBFF', 'ي': 'FEF1 FEF2 FEF3 FEF4', 'ذ': 'FEAB FEAC', 'ض': 'FEBD FEBE FEBF FEC0', 'غ': 'FECD FECE FECF FED0',
}
FORMS = {k: [int(h, 16) for h in v.split()] for k, v in FORMS.items()}
DUAL = {k for k, v in FORMS.items() if len(v) == 4}
ZWNJ, DRAWN = '‌', '¦'           # ZWNJ not drawn (the shapes show it) / drawn as a zero-width glyph
INIT_FOR_MEDIAL = set('نبتیپ')

def shape(word):
    """logical word → [(code drawn, ToUnicode text)] in logical order, with PowerPoint-in-Arial's lies"""
    out, i = [], 0
    while i < len(word):
        c = word[i]
        if c == ZWNJ: i += 1; continue
        if c == DRAWN: out.append((0x200C, ZWNJ)); i += 1; continue
        if c not in FORMS: out.append((ord(c), c)); i += 1; continue
        prev = word[i - 1] if i else ''
        joins_prev = prev in DUAL
        if c == 'ل' and i + 1 < len(word) and word[i + 1] == 'ا':
            out.append((0xFEFC if joins_prev else 0xFEFB, 'لا')); i += 2; continue
        nxt = word[i + 1] if i + 1 < len(word) else ''
        joins_next = c in DUAL and nxt in FORMS
        f = FORMS[c]
        form = 3 if joins_prev and joins_next else 1 if joins_prev else 2 if joins_next else 0
        if c not in DUAL and c != 'ا' and form == 1: form = 0      # right-joining after a joiner: the isolated glyph (not alef)
        if c in INIT_FOR_MEDIAL and form == 3: form = 2           # medial drawn with the initial glyph
        if c in 'طظ': form = 0                                     # one glyph for every form
        out.append((f[form], c))
        i += 1
    return out

CODES = {c for v in FORMS.values() for c in v} | {ord(c) for c in FORMS} | {0x20, 0x200C, 0x2E, 0x60C, 0xFEFB, 0xFEFC}
LATIN = {ord(c) for c in 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789()'} | {0x20}

class Font:
    def __init__(self, key, codes, ps):
        src = TTFont(REG); cm = src.getBestCmap()
        opts = subset.Options(); opts.layout_features = []; opts.notdef_outline = True; opts.name_IDs = ['*']; opts.glyph_names = True
        sub = subset.Subsetter(opts); sub.populate(unicodes=sorted(c for c in codes if c in cm)); sub.subset(src)
        buf = io.BytesIO(); src.save(buf); self.bytes = buf.getvalue()
        self.key, self.ps, self.font = key, ps, TTFont(io.BytesIO(self.bytes))
        self.cmap, self.upem = self.font.getBestCmap(), self.font['head'].unitsPerEm
        self.tounicode = {}
    def gid(self, code): return self.font.getGlyphID(self.cmap[code])
    def adv(self, code, size): return self.font['hmtx'][self.cmap[code]][0] * size / self.upem
# (two subsets under one name, as PowerPoint embeds Arial: the Persian text's and the Latin run's)
FONTS = {'F1': Font('F1', CODES, 'LegacyArialMT'), 'F3': Font('F3', LATIN, 'LegacyArialMT'), 'F4': Font('F4', LATIN, 'LegacyArialMT')}
SPACE_EM = FONTS['F1'].adv(0x20, 1)

def is_latin(t): return all(c.isascii() for c in t)

def visual(text):
    """one right-to-left line → [(font, code, name)] left to right; Latin runs kept left to right, no space glyph in them"""
    toks = text.split(' ')
    runs = []                                       # [(latin?, [tokens])]
    for t in toks:
        lat = is_latin(t)
        if runs and runs[-1][0] == lat and lat: runs[-1][1].append(t)
        else: runs.append((lat, [t]))
    out = []
    for k, (lat, ts) in enumerate(reversed(runs)):
        if k: out.append(('F1', 0x20, ' '))
        if lat:
            for j, t in enumerate(ts):
                if j: out.append(('F4', None, None))          # a gap, no glyph
                LF = 'F3' if '(' in t else 'F4'
                for c in t:
                    # (the bracket's shape as RTL shows it, named by the logical character: the left one «)»)
                    if c == '(': out.append(('F3', ord(')'), '('))
                    elif c == ')': out.append(('F3', ord('('), ')'))
                    else: out.append((LF, ord(c), c))
            # (in RTL the brackets show mirrored: swap so the shape at the left opens)
            seg = out[len(out) - sum(len(t) for t in ts) - (len(ts) - 1):]
            for q, g in enumerate(seg):
                if g[1] in (ord('('), ord(')')): seg[q] = ('F3', ord('(') if g[1] == ord(')') else ord(')'), ')' if g[1] == ord(')') else '(')
            out[len(out) - len(seg):] = seg
        else:
            for j, t in enumerate(reversed(ts)):
                if j: out.append(('F1', 0x20, ' '))
                out.extend(('F1', c, n) for c, n in reversed(shape(t)))
    return out

ops = {1: [], 2: [], 3: []}
def width(gl, size): return sum((SPACE_EM * size * 1.2 if c is None else FONTS[f].adv(c, size)) for f, c, _ in gl)
def line(page, text, y, size, align, justify=None):
    gl = visual(text)
    w = width(gl, size)
    # (justified, as PowerPoint sets the paragraph: the room left shared out over the word gaps)
    gaps = sum(1 for f, c, _ in gl if c is None or c == 0x20)
    extra = (justify - w) / gaps if justify and gaps else 0
    x = align[1] - (w + extra * gaps) if align[0] == 'r' else align[1] - w / 2
    for f, c, n in gl:
        if c is None: x += SPACE_EM * size * 1.2 + extra; continue
        F = FONTS[f]; g = F.gid(c); F.tounicode.setdefault(g, n)
        ops[page].append('0.15 0.35 0.65 rg BT /%s %.2f Tf 1 0 0 1 %.3f %.3f Tm <%04X> Tj ET' % (f, size, x, y, g))
        x += F.adv(c, size) + (extra if c == 0x20 else 0)
    return w

def rounded(page, x0, y0, x1, y1, r=18):
    k = 0.5523 * r
    ops[page].append('0.7 G 1 w %.2f %.2f m %.2f %.2f l %.2f %.2f %.2f %.2f %.2f %.2f c %.2f %.2f l %.2f %.2f %.2f %.2f %.2f %.2f c '
                     '%.2f %.2f l %.2f %.2f %.2f %.2f %.2f %.2f c %.2f %.2f l %.2f %.2f %.2f %.2f %.2f %.2f c h S 0 G' % (
        x0 + r, y0, x1 - r, y0, x1 - r + k, y0, x1, y0 + r - k, x1, y0 + r, x1, y1 - r, x1, y1 - r + k, x1 - r + k, y1, x1 - r, y1,
        x0 + r, y1, x0 + r - k, y1, x0, y1 - r + k, x0, y1 - r, x0, y0 + r, x0, y0 + r - k, x0 + r - k, y0, x0 + r, y0))
def grid(page):
    # 4 × 8 discs at a 16.5 / 16 pt pitch; the last column and the fourth row drawn 4.5 pt, the rest 4
    for r in range(8):
        for c in range(4):
            d = 4.5 if c == 3 or r == 3 else 4.0
            x, y = 698 + 16.5 * c, 112 + 16 * r
            k = 0.5523 * d / 2; cx, cy, rr = x + d / 2, y + d / 2, d / 2
            ops[page].append('0.85 g %.2f %.2f m %.2f %.2f %.2f %.2f %.2f %.2f c %.2f %.2f %.2f %.2f %.2f %.2f c %.2f %.2f %.2f %.2f %.2f %.2f c %.2f %.2f %.2f %.2f %.2f %.2f c f 0 g' % (
                cx + rr, cy, cx + rr, cy + k, cx + k, cy + rr, cx, cy + rr, cx - k, cy + rr, cx - rr, cy + k, cx - rr, cy,
                cx - rr, cy - k, cx - k, cy - rr, cx, cy - rr, cx + k, cy - rr, cx + rr, cy - k, cx + rr, cy))

R = 660
# slide 1: a title box, the paragraph beside the grid
rounded(1, 250, 345, 700, 400)
line(1, 'معرفی سامانه نمونه', 365, 22, ('c', 475))
grid(1)
PARA = ['این سامانه برای ارزیابی درخواست¦ها طراحی شده است و از طریق مطلب',
        'داده¦ها گزارش شخصي‌سازي‌شده را برای کاربران آماده می‌کند و منظور',
        'هر کاربر با ابزار Open Data Kit 2 فرم خود را پر کرده و نتیجه را',
        'در مرکز (AI) با نظام نوین می‌بیند و گزارش او ارسال می‌شود.']
for k, t in enumerate(PARA): line(1, t, 220 - 25 * k, 14, ('r', R), justify=440 if k < len(PARA) - 1 else None)
# slide 2: a title in its own frame over a picture
rounded(2, 300, 345, 740, 400)
line(2, 'نمای سامانه نمونه', 365, 22, ('c', 520))
ops[2].append('0.55 g 300 80 440 240 re f 0 g')
# slide 3: a list with square bullets beside the grid
grid(3)
ITEMS = ['بررسی خودکار داده¦ها در هر هفته', 'ارسال گزارش شخصي‌سازي‌شده به کاربران', 'نگهداری نسخه¦های پیشین', 'گزارش ماهانه برای مدیران']
for k, t in enumerate(ITEMS):
    y = 220 - 30 * k
    line(3, t, y, 14, ('r', R - 18))
    ops[3].append('0.15 0.35 0.65 rg %.2f %.2f 4 4 re f 0 g' % (R - 8, y + 3))

EXPECTED = '''# معرفی سامانه نمونه

این سامانه برای ارزیابی درخواست‌ها طراحی شده است و از طریق مطلب داده‌ها گزارش شخصي‌سازي‌شده را برای کاربران آماده می‌کند و منظور هر کاربر با ابزار Open Data Kit 2 فرم خود را پر کرده و نتیجه را در مرکز (AI) با نظام نوین می‌بیند و گزارش او ارسال می‌شود.

# نمای سامانه نمونه

-   بررسی خودکار داده‌ها در هر هفته
-   ارسال گزارش شخصي‌سازي‌شده به کاربران
-   نگهداری نسخه‌های پیشین
-   گزارش ماهانه برای مدیران
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
    if k == 'F1': F.tounicode.setdefault(F.gid(0x20), ' ')
    ff = obj(stream(F.bytes, '/Length1 %d' % len(F.bytes)))
    bb = F.font['head']
    box = tuple(round(v * 1000 / F.upem) for v in (bb.xMin, bb.yMin, bb.xMax, bb.yMax))
    desc = obj(('<< /Type /FontDescriptor /FontName /%s /Flags 32 /FontBBox [%d %d %d %d] /ItalicAngle 0 '
                '/Ascent 905 /Descent -212 /CapHeight 716 /StemV 80 /FontFile2 %d 0 R >>' % ((F.ps,) + box + (ff,))).encode())
    widths = ' '.join('%d [%d]' % (g, round(F.font['hmtx'][F.font.getGlyphName(g)][0] * 1000 / F.upem)) for g in sorted(F.tounicode))
    cid = obj(('<< /Type /Font /Subtype /CIDFontType2 /BaseFont /%s /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> '
               '/FontDescriptor %d 0 R /CIDToGIDMap /Identity /W [%s] >>' % (F.ps, desc, widths)).encode())
    cm = ('/CIDInit /ProcSet findresource begin 12 dict begin begincmap /CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def '
          '/CMapName /Adobe-Identity-UCS def /CMapType 2 def 1 begincodespacerange <0000> <FFFF> endcodespacerange\n%d beginbfchar\n%s\nendbfchar\n'
          'endcmap CMapName currentdict /CMap defineresource pop end end') % (len(F.tounicode), '\n'.join('<%04X> <%s>' % (g, u16(t)) for g, t in sorted(F.tounicode.items())))
    tu = obj(stream(cm.encode()))
    fontref[k] = obj(('<< /Type /Font /Subtype /Type0 /BaseFont /%s /Encoding /Identity-H /DescendantFonts [%d 0 R] /ToUnicode %d 0 R >>' % (F.ps, cid, tu)).encode())
pages_id = len(objs) + 2 * 3 + 1
kids = []
res = ' '.join('/%s %d 0 R' % (k, v) for k, v in fontref.items())
for p in (1, 2, 3):
    c = obj(stream('\n'.join(ops[p]).encode()))
    kids.append(obj(('<< /Type /Page /Parent %d 0 R /MediaBox [0 0 %g %g] /Resources << /Font << %s >> >> /Contents %d 0 R >>' % (pages_id, W, H, res, c)).encode()))
assert obj(('<< /Type /Pages /Kids [%s] /Count 3 >>' % ' '.join('%d 0 R' % k for k in kids)).encode()) == pages_id
cat = obj(('<< /Type /Catalog /Pages %d 0 R /Lang (fa-IR) >>' % pages_id).encode())
info = obj(b'<< /Producer (Microsoft\xae PowerPoint\xae LTSC) /Creator (Microsoft\xae PowerPoint\xae LTSC) /Title (deck-arial) >>')
out = io.BytesIO(); out.write(b'%PDF-1.7\n%\xe2\xe3\xcf\xd3\n'); offs = []
for i, b in enumerate(objs):
    offs.append(out.tell()); out.write(b'%d 0 obj\n' % (i + 1) + b + b'\nendobj\n')
x = out.tell()
out.write(b'xref\n0 %d\n0000000000 65535 f \n' % (len(objs) + 1) + b''.join(b'%010d 00000 n \n' % o for o in offs))
out.write(b'trailer\n<< /Size %d /Root %d 0 R /Info %d 0 R >>\nstartxref\n%d\n%%%%EOF\n' % (len(objs) + 1, cat, info, x))
open(os.path.join(LAB, 'pdf', 'producers', 'pptx-arial--deck-arial.pdf'), 'wb').write(out.getvalue())
open(os.path.join(LAB, 'corpus', 'deck-arial.md'), 'w').write(EXPECTED)
print('pdf/pptx-arial--deck-arial.pdf', len(out.getvalue()), 'bytes')
