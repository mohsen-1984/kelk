# A Persian letter with a ruled table as Prince prints it — built by hand, glyph by glyph, each habit on purpose:
#   · simple TrueType subsets (one-byte codes) whose ToUnicode names every form by its base letter, the subset's glyphs
#     in the full font's order — a letter's forms one after another: isolated, final, initial, medial. No ZWNJ is
#     drawn: «نقش‌ها» shows only by its final ش («نقشها» came back). The bold face of the subject line uses a few forms
#     only: their widths tell them, against the regular face's
#   · the table's cell borders as CSS inset / outset borders: each cell two L-shaped filled bands, mitred at the corners
#     (no rule was found, and the table came apart into lines); its cells' lines justified — word gaps wide enough to cut
#     a line into pieces — and set tighter than their size; its last row alone at the top of page 2
#   · a signature at the far (left) side, bold and a size up: no heading; its «برنامه‌ریزی» in the bold face, whose heh
#     has three codes only (no width tells heh's forms: where its codes stand does)
#   · the letterhead printed as one picture behind each page, its field labels in it; the date, number and attachment
#     values written over it as text at the top left of both pages (taken for a running head, gone from the letter);
#     the number with a note in brackets wrapped under it («451288 (نسخه» over «دوم)»)
# The Markdown that must come back is corpus/prince-table.md.
#   python3 scripts/make-prince-table.py      → pdf/prince-letter--prince-table.pdf, corpus/prince-table.md
import os, sys, io, zlib
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rtl_pdf import FORMS, shape, visual, LAB, REG, BOLD
from fontTools.ttLib import TTFont, newTable
from fontTools.ttLib.tables._c_m_a_p import cmap_format_6, cmap_format_4
from fontTools import subset

W, H = 595.28, 841.89
SUBJECT = 'موضوع: تعیین نقش‌ها و مسئولیت‌های واحدها'
PARA = ['احتراماً، با توجه به نقش‌ها و مسئولیت‌های تعیین شده برای واحدهای سازمان در نظام',
        'نوین داده، به استحضار می‌رساند که بیشتر تکالیف بین سه واحد تقسیم شده است و تصمیم‌گیری',
        'درباره نقش‌های باقیمانده با نظر رئیس درس به شرح زیر پیشنهاد می‌شود.']
ROWS = [('مرحله', 'مسئولیت', 'متولی'),
        ('سیاست‌گذاری', ['تصویب سیاست‌ها و خط مشی‌های', 'نظام داده در سطح کلان'], 'شورای عالی'),
        ('شناسایی داده', ['فهرست‌برداری داده‌های موجود و', 'شناسایی داده‌های مورد نیاز'], ['واحدهای سازمانی با', 'مشارکت معاونت برنامه']),
        ('پشتیبانی فنی', ['پشتیبانی فنی شامل امنیت و', 'یکپارچگی و اتصال داده‌ها'], 'مرکز فناوری'),
        ('ارزیابی بلوغ', ['پایش و ارتقای سطح بلوغ', 'داده در همه واحدها'], 'معاونت برنامه')]
SIGN = ['مدیر واحد نمونه', 'سرپرست گروه برنامه‌ریزی']
HEAD = ['1403/06/12', '451288 (نسخه', 'دوم)', 'ندارد']   # date, number (a note in brackets, wrapped under it), attachments:
                                                        # values only, their labels in the picture

texts = {'F1': HEAD + ['()'] + PARA + [c for r in ROWS for x in r for c in (x if isinstance(x, list) else [x])], 'F2': [SUBJECT] + SIGN}

class SimpleFont:
    """a one-byte TrueType subset: its glyphs in the full font's order, code k = the subset's k-th glyph"""
    def __init__(self, path, ps, lines):
        src = TTFont(path); cm = src.getBestCmap()
        used = {0x20}
        for t in lines:
            for c, _ in visual(t): used.add(c)
        names = sorted({cm[u] for u in used if u in cm}, key=src.getGlyphID)
        assert len(names) < 250, len(names)
        opts = subset.Options(); opts.layout_features = []; opts.notdef_outline = True; opts.name_IDs = ['*']; opts.glyph_names = True
        opts.drop_tables += ['FFTM']
        sub = subset.Subsetter(opts); sub.populate(glyphs=names); sub.subset(src)
        order = src.getGlyphOrder()
        self.code = {}; self.name = {}
        for k, gn in enumerate(order[1:], start=1): self.code[gn] = k
        # (1,0) and (3,0) cmaps by code, as Prince writes them
        t6 = cmap_format_6(6); t6.platformID, t6.platEncID, t6.language = 1, 0, 0
        t6.cmap = {k: gn for gn, k in self.code.items()}
        t4 = cmap_format_4(4); t4.platformID, t4.platEncID, t4.language = 3, 0, 0
        t4.cmap = {0xF000 + k: gn for gn, k in self.code.items()}
        src['cmap'] = newTable('cmap'); src['cmap'].tableVersion = 0; src['cmap'].tables = [t6, t4]
        buf = io.BytesIO(); src.save(buf); self.bytes = buf.getvalue()
        self.font = TTFont(io.BytesIO(self.bytes)); self.upem = self.font['head'].unitsPerEm
        self.ucmap = cm; self.ps = ps
        self.tounicode = {}
    def put(self, u, name):
        gn = self.ucmap[u]; k = self.code[gn]
        self.tounicode.setdefault(k, name)
        return k
    def adv(self, u, size): return self.font['hmtx'][self.ucmap[u]][0] * size / self.upem

FONTS = {'F1': SimpleFont(REG, 'PXAAAA+DemoNaskh', texts['F1']), 'F2': SimpleFont(BOLD, 'PXAAAB+DemoNaskh-Bold', texts['F2'])}
# (the regular face must show four forms in a row of a few tailed letters: what the reading checks)
ops = {1: [], 2: []}
def width(gl, size, f): return sum(FONTS[f].adv(c, size) for c, _ in gl)
def line(page, text, y, size, right, f='F1', justify=None, colour='0 g'):
    gl = visual(text); w = width(gl, size, f)
    n = sum(1 for c, _ in gl if c == 0x20)
    extra = (justify - w) / n if justify and n else 0
    assert extra >= 0, (text, w, justify)
    x = right - w - extra * n
    F = FONTS[f]
    for c, nm in gl:
        k = F.put(c, nm)
        ops[page].append('%s BT /%s %.2f Tf 1 0 0 1 %.3f %.3f Tm <%02X> Tj ET' % (colour, f, size, x, y, k))
        x += F.adv(c, size) + (extra if c == 0x20 else 0)
def cell_border(page, x0, y0, x1, y1):
    t = 0.75
    ops[page].append('0 g %.2f %.2f m %.2f %.2f l %.2f %.2f l %.2f %.2f l %.2f %.2f l %.2f %.2f l h f' % (x0, y0, x0, y1, x1, y1, x1 - t, y1 - t, x0 + t, y1 - t, x0 + t, y0 + t))
    ops[page].append('0.5 g %.2f %.2f m %.2f %.2f l %.2f %.2f l %.2f %.2f l %.2f %.2f l %.2f %.2f l h f 0 g' % (x1, y1, x1, y0, x0, y0, x0 + t, y0 + t, x1 - t, y0 + t, x1 - t, y1 - t))

R = 540
line(1, SUBJECT, 720, 12, R, 'F2')
for k, t in enumerate(PARA): line(1, t, 690 - 17 * k, 12, R, justify=480 if k < len(PARA) - 1 else None)
XS = [60, 230, 440, 540]                      # column edges, left to right (right to left: مرحله | مسئولیت | متولی)
def row(page, top, cells, hgt):
    for c in range(3):
        cell_border(page, XS[c], top - hgt, XS[c + 1], top)
    for col, val in zip((2, 1, 0), cells):
        ls = val if isinstance(val, list) else [val]
        x0, x1 = XS[col], XS[col + 1]
        for k, t in enumerate(ls):
            y = top - 14 - 11 * k                 # (11 pt apart at 12 pt: tighter than the size)
            if len(ls) > 1 and k < len(ls) - 1: line(page, t, y, 12, x1 - 5, justify=x1 - x0 - 10)
            else: line(page, t, y, 12, x1 - 5 - (0 if len(ls) > 1 else (x1 - x0 - 10 - width(visual(t), 12, 'F1')) / 2))
top = 620
for r in ROWS[:-1]:
    hgt = 20 if not any(isinstance(x, list) for x in r) else 31
    row(1, top, r, hgt); top -= hgt
row(2, 750, ROWS[-1], 31)
for p in (1, 2):
    ops[p].insert(0, 'q %.2f 0 0 %.2f 0 0 cm /Im1 Do Q' % (W, H))     # the letterhead: one picture behind the page
    for t, y in zip(HEAD, (812, 796, 781, 765)):
        if t.startswith('451288') or t.endswith(')'):
            # «451288 (نسخه» over «دوم)»: Prince draws a bracket in a right-to-left run as the shape it shows and
            # names it so — «)» at the word's left; the reader mirrors it back — drawn by hand
            gl = (visual('نسخه') + [(ord(')'), ')'), (0x20, ' ')] + [(ord(c), c) for c in '451288']) if t.startswith('451288') else \
                 ([(ord('('), '(')] + visual('دوم'))
            x = 100 - width(gl, 11, 'F1')
            for c, nm in gl:
                k = FONTS['F1'].put(c, nm)
                ops[p].append('0 g BT /F1 11.00 Tf 1 0 0 1 %.3f %.3f Tm <%02X> Tj ET' % (x, y, k)); x += FONTS['F1'].adv(c, 11)
        else: line(p, t, y, 11, 100)
for k, t in enumerate(SIGN): line(2, t, 680 - 16 * k, 13, 130 + width(visual(t), 13, 'F2') / 2, 'F2')   # (centred on x = 130)

EXPECTED = '''تاریخ: 1403/06/12

شماره: 451288 (نسخه دوم)

پیوست: ندارد

**موضوع: تعیین نقش‌ها و مسئولیت‌های واحدها**

احتراماً، با توجه به نقش‌ها و مسئولیت‌های تعیین شده برای واحدهای سازمان در نظام نوین داده، به استحضار می‌رساند که بیشتر تکالیف بین سه واحد تقسیم شده است و تصمیم‌گیری درباره نقش‌های باقیمانده با نظر رئیس درس به شرح زیر پیشنهاد می‌شود.

| مرحله | مسئولیت | متولی |
| --- | --- | --- |
| سیاست‌گذاری | تصویب سیاست‌ها و خط مشی‌های نظام داده در سطح کلان | شورای عالی |
| شناسایی داده | فهرست‌برداری داده‌های موجود و شناسایی داده‌های مورد نیاز | واحدهای سازمانی با مشارکت معاونت برنامه |
| پشتیبانی فنی | پشتیبانی فنی شامل امنیت و یکپارچگی و اتصال داده‌ها | مرکز فناوری |
| ارزیابی بلوغ | پایش و ارتقای سطح بلوغ داده در همه واحدها | معاونت برنامه |

**مدیر واحد نمونه**\\
**سرپرست گروه برنامه‌ریزی**
'''

# ── the PDF ────────────────────────────────────────────────────────────
objs = []
def obj(b): objs.append(b); return len(objs)
def stream(data, extra=''):
    z = zlib.compress(data)
    return b'<< /Length %d /Filter /FlateDecode %s >>\nstream\n' % (len(z), extra.encode()) + z + b'\nendstream'
fontref = {}
for k, F in FONTS.items():
    F.tounicode.setdefault(F.put(0x20, ' '), ' ')
    ff = obj(stream(F.bytes, '/Length1 %d' % len(F.bytes)))
    bb = F.font['head']
    box = tuple(round(v * 1000 / F.upem) for v in (bb.xMin, bb.yMin, bb.xMax, bb.yMax))
    desc = obj(('<< /Type /FontDescriptor /FontName /%s /Flags 4 /FontBBox [%d %d %d %d] /ItalicAngle 0 /Ascent 928 /Descent -236 '
                '/CapHeight 729 /StemV 80 /FontFile2 %d 0 R >>' % ((F.ps,) + box + (ff,))).encode())
    last = max(F.code.values())
    order = F.font.getGlyphOrder()
    widths = ' '.join('%d' % round(F.font['hmtx'][order[c]][0] * 1000 / F.upem) for c in range(1, last + 1))
    cm = ('/CIDInit /ProcSet findresource begin 12 dict begin begincmap /CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def '
          '/CMapName /Adobe-Identity-UCS def /CMapType 2 def 1 begincodespacerange <00> <FF> endcodespacerange\n%d beginbfchar\n%s\nendbfchar\n'
          'endcmap CMapName currentdict /CMap defineresource pop end end') % (len(F.tounicode), '\n'.join('<%02X> <%s>' % (c, ''.join('%04X' % ord(x) for x in t)) for c, t in sorted(F.tounicode.items())))
    tu = obj(stream(cm.encode()))
    fontref[k] = obj(('<< /Type /Font /Subtype /TrueType /BaseFont /%s /FirstChar 1 /LastChar %d /Widths [%s] /FontDescriptor %d 0 R /ToUnicode %d 0 R >>' % (F.ps, last, widths, desc, tu)).encode())
# the letterhead picture: a grey frame, a band at the top and dotted leaders where the labels stand (no text of its own)
PW, PH = 119, 168
px = bytearray(b'\xff' * (PW * PH))
for yy in range(PH):
    for xx in range(PW):
        if yy < 3 or yy > PH - 4 or xx < 3 or xx > PW - 4: px[yy * PW + xx] = 0x99
        elif 8 <= yy <= 30 and 45 <= xx <= 75: px[yy * PW + xx] = 0xC8
for k in range(3):
    for xx in range(21, 31, 2): px[(5 + 3 * k) * PW + xx] = 0x80
img = obj(stream(bytes(px), '/Type /XObject /Subtype /Image /Width %d /Height %d /ColorSpace /DeviceGray /BitsPerComponent 8' % (PW, PH)))
pages_id = len(objs) + 2 * 2 + 1
kids = []
res = ' '.join('/%s %d 0 R' % (k, v) for k, v in fontref.items())
for p in (1, 2):
    c = obj(stream('\n'.join(ops[p]).encode()))
    kids.append(obj(('<< /Type /Page /Parent %d 0 R /MediaBox [0 0 %g %g] /Resources << /Font << %s >> /XObject << /Im1 %d 0 R >> >> /Contents %d 0 R >>' % (pages_id, W, H, res, img, c)).encode()))
assert obj(('<< /Type /Pages /Kids [%s] /Count 2 >>' % ' '.join('%d 0 R' % k for k in kids)).encode()) == pages_id
cat = obj(('<< /Type /Catalog /Pages %d 0 R /Lang (fa-IR) >>' % pages_id).encode())
info = obj(b'<< /Producer (Prince 14.3 \\(www.princexml.com\\)) /Title (pdf) >>')
out = io.BytesIO(); out.write(b'%PDF-1.7\n%\xe2\xe3\xcf\xd3\n'); offs = []
for i, b in enumerate(objs):
    offs.append(out.tell()); out.write(b'%d 0 obj\n' % (i + 1) + b + b'\nendobj\n')
x = out.tell()
out.write(b'xref\n0 %d\n0000000000 65535 f \n' % (len(objs) + 1) + b''.join(b'%010d 00000 n \n' % o for o in offs))
out.write(b'trailer\n<< /Size %d /Root %d 0 R /Info %d 0 R >>\nstartxref\n%d\n%%%%EOF\n' % (len(objs) + 1, cat, info, x))
open(os.path.join(LAB, 'pdf', 'producers', 'prince-letter--prince-table.pdf'), 'wb').write(out.getvalue())
open(os.path.join(LAB, 'corpus', 'prince-table.md'), 'w').write(EXPECTED)
print('pdf/prince-letter--prince-table.pdf', len(out.getvalue()), 'bytes')
