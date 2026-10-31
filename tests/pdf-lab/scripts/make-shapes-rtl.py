# A Persian letter as Prince prints it with a modern font — built by hand, glyph by glyph (fontTools, DejaVu Sans), for
# one habit (round 26, «shapes by use»): simple TrueType subsets (one-byte codes) whose ToUnicode names every form by its
# base letter, and no ZWNJ drawn; but unlike make-prince-table.py's B font, the codes keep no order of forms (a font
# whose forms come from its GSUB table — no presentation forms in its cmap, no glyph names left in the subset), so
# neither the glyph order nor the widths tell a form. The regular face is used enough for its forms to show by use; the
# bold face only for two short lines, each with «توسعه‌های» — too rare to count: «توسعههای» came back. The outlines
# still tell: a joining side's stroke runs to the glyph's edge.
#   python3 scripts/make-shapes-rtl.py      → pdf/producers/prince-shapes--shapes-fa.pdf, corpus/shapes-fa.md
import os, sys, io, zlib, random
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rtl_pdf import visual, LAB, REG, BOLD
from fontTools.ttLib import TTFont, newTable
from fontTools.ttLib.tables._c_m_a_p import cmap_format_6, cmap_format_4
from fontTools import subset

W, H = 595.28, 841.89
SUBJECT = 'موضوع: توسعه‌های تازه سامانه'
HEAD2 = 'توسعه‌های پیشنهادی این دوره'
PARA1 = ['با سلام، به استحضار می‌رساند که برنامه‌ریزی این سامانه در جلسه هفته گذشته بررسی شد',
         'و همه واحدها نظر خود را درباره نرم‌افزار تازه و داده‌های آن اعلام کردند. گروه فنی',
         'پیشنهاد کرد که توسعه سامانه در دو مرحله انجام شود و هر مرحله با گزارشی کوتاه همراه باشد.']
PARA2 = ['در مرحله نخست، صفحه‌های گزارش و فرم‌های ورود داده آماده می‌شود و در مرحله دوم، اتصال',
         'سامانه به نرم‌افزارهای دیگر واحدها برقرار خواهد شد. نتیجه هر مرحله به همه واحدها اعلام می‌شود.']

class SimpleFont:
    """a one-byte TrueType subset whose codes follow no order of forms (shuffled), with no glyph names"""
    def __init__(self, path, ps, lines, seed):
        src = TTFont(path); cm = src.getBestCmap()
        used = {0x20}
        for t in lines:
            for c, _ in visual(t): used.add(c)
        names = sorted({cm[u] for u in used if u in cm}, key=src.getGlyphID)
        opts = subset.Options(); opts.layout_features = []; opts.notdef_outline = True; opts.name_IDs = ['*']; opts.glyph_names = False
        opts.drop_tables += ['FFTM']
        sub = subset.Subsetter(opts); sub.populate(glyphs=names); sub.subset(src)
        order = src.getGlyphOrder()[1:]
        codes = list(range(1, len(order) + 1)); random.Random(seed).shuffle(codes)
        self.code = dict(zip(order, codes))
        t6 = cmap_format_6(6); t6.platformID, t6.platEncID, t6.language = 1, 0, 0
        t6.cmap = {k: gn for gn, k in self.code.items()}
        t4 = cmap_format_4(4); t4.platformID, t4.platEncID, t4.language = 3, 0, 0
        t4.cmap = {0xF000 + k: gn for gn, k in self.code.items()}
        src['cmap'] = newTable('cmap'); src['cmap'].tableVersion = 0; src['cmap'].tables = [t6, t4]
        src['post'].formatType = 3.0
        buf = io.BytesIO(); src.save(buf); self.bytes = buf.getvalue()
        self.font = TTFont(io.BytesIO(self.bytes)); self.upem = self.font['head'].unitsPerEm
        self.gname = {k: gn for gn, k in self.code.items()}
        self.ucmap = cm; self.ps = ps; self.tounicode = {}
        self.srcname = {gn: gn for gn in order}
    def put(self, u, name):
        k = self.code[self.ucmap[u]]
        self.tounicode.setdefault(k, name)
        return k
    def adv(self, u, size): return self.hm[self.ucmap[u]] * size / self.upem

# (the subset renames its glyphs glyph00001 …: widths are read from the source font by the source names)
FONTS = {}
for k, path, ps, lines, seed in (('F1', REG, 'PXAAAC+DemoSans', PARA1 + PARA2, 3), ('F2', BOLD, 'PXAAAD+DemoSans-Bold', [SUBJECT, HEAD2], 5)):
    F = SimpleFont(path, ps, lines, seed); full = TTFont(path)
    F.hm = {gn: full['hmtx'][gn][0] for gn in F.code}
    FONTS[k] = F
ops = {1: []}
def width(gl, size, f): return sum(FONTS[f].adv(c, size) for c, _ in gl)
def line(page, text, y, size, right, f='F1'):
    gl = visual(text); x = right - width(gl, size, f); F = FONTS[f]
    for c, nm in gl:
        k = F.put(c, nm)
        ops[page].append('0 g BT /%s %.2f Tf 1 0 0 1 %.3f %.3f Tm <%02X> Tj ET' % (f, size, x, y, k))
        x += F.adv(c, size)
R = 540
line(1, SUBJECT, 760, 12, R, 'F2')
for k, t in enumerate(PARA1): line(1, t, 730 - 18 * k, 12, R)
line(1, HEAD2, 660, 12, R, 'F2')
for k, t in enumerate(PARA2): line(1, t, 636 - 18 * k, 12, R)

EXPECTED = '''**موضوع: توسعه‌های تازه سامانه**

با سلام، به استحضار می‌رساند که برنامه‌ریزی این سامانه در جلسه هفته گذشته بررسی شد و همه واحدها نظر خود را درباره نرم‌افزار تازه و داده‌های آن اعلام کردند. گروه فنی پیشنهاد کرد که توسعه سامانه در دو مرحله انجام شود و هر مرحله با گزارشی کوتاه همراه باشد.

**توسعه‌های پیشنهادی این دوره**

در مرحله نخست، صفحه‌های گزارش و فرم‌های ورود داده آماده می‌شود و در مرحله دوم، اتصال سامانه به نرم‌افزارهای دیگر واحدها برقرار خواهد شد. نتیجه هر مرحله به همه واحدها اعلام می‌شود.
'''

objs = []
def obj(b): objs.append(b); return len(objs)
def stream(data, extra=''):
    z = zlib.compress(data)
    return b'<< /Length %d /Filter /FlateDecode %s >>\nstream\n' % (len(z), extra.encode()) + z + b'\nendstream'
fontref = {}
for k, F in FONTS.items():
    F.put(0x20, ' ')
    ff = obj(stream(F.bytes, '/Length1 %d' % len(F.bytes)))
    bb = F.font['head']
    box = tuple(round(v * 1000 / F.upem) for v in (bb.xMin, bb.yMin, bb.xMax, bb.yMax))
    desc = obj(('<< /Type /FontDescriptor /FontName /%s /Flags 4 /FontBBox [%d %d %d %d] /ItalicAngle 0 /Ascent 928 /Descent -236 '
                '/CapHeight 729 /StemV 80 /FontFile2 %d 0 R >>' % ((F.ps,) + box + (ff,))).encode())
    last = max(F.code.values())
    widths = ' '.join('%d' % round(F.hm[F.gname[c]] * 1000 / F.upem) for c in range(1, last + 1))
    cm = ('/CIDInit /ProcSet findresource begin 12 dict begin begincmap /CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def '
          '/CMapName /Adobe-Identity-UCS def /CMapType 2 def 1 begincodespacerange <00> <FF> endcodespacerange\n%d beginbfchar\n%s\nendbfchar\n'
          'endcmap CMapName currentdict /CMap defineresource pop end end') % (len(F.tounicode), '\n'.join('<%02X> <%s>' % (c, ''.join('%04X' % ord(x) for x in t)) for c, t in sorted(F.tounicode.items())))
    tu = obj(stream(cm.encode()))
    fontref[k] = obj(('<< /Type /Font /Subtype /TrueType /BaseFont /%s /FirstChar 1 /LastChar %d /Widths [%s] /FontDescriptor %d 0 R /ToUnicode %d 0 R >>' % (F.ps, last, widths, desc, tu)).encode())
pages_id = len(objs) + 2 + 1
res = ' '.join('/%s %d 0 R' % (k, v) for k, v in fontref.items())
c = obj(stream('\n'.join(ops[1]).encode()))
kid = obj(('<< /Type /Page /Parent %d 0 R /MediaBox [0 0 %g %g] /Resources << /Font << %s >> >> /Contents %d 0 R >>' % (pages_id, W, H, res, c)).encode())
assert obj(('<< /Type /Pages /Kids [%d 0 R] /Count 1 >>' % kid).encode()) == pages_id
cat = obj(('<< /Type /Catalog /Pages %d 0 R /Lang (fa-IR) >>' % pages_id).encode())
info = obj(b'<< /Producer (Prince 15.1 \\(www.princexml.com\\)) /Title (shapes) >>')
out = io.BytesIO(); out.write(b'%PDF-1.7\n%\xe2\xe3\xcf\xd3\n'); offs = []
for i, b in enumerate(objs):
    offs.append(out.tell()); out.write(b'%d 0 obj\n' % (i + 1) + b + b'\nendobj\n')
x = out.tell()
out.write(b'xref\n0 %d\n0000000000 65535 f \n' % (len(objs) + 1) + b''.join(b'%010d 00000 n \n' % o for o in offs))
out.write(b'trailer\n<< /Size %d /Root %d 0 R /Info %d 0 R >>\nstartxref\n%d\n%%%%EOF\n' % (len(objs) + 1, cat, info, x))
open(os.path.join(LAB, 'pdf', 'producers', 'prince-shapes--shapes-fa.pdf'), 'wb').write(out.getvalue())
open(os.path.join(LAB, 'corpus', 'shapes-fa.md'), 'w').write(EXPECTED)
print('pdf/producers/prince-shapes--shapes-fa.pdf', len(out.getvalue()), 'bytes')
