# A Persian booklet's pages as Acrobat's PDFMaker prints a Word document — built by hand, glyph by glyph, each habit on
# purpose:
#   · a zero-width ZWNJ drawn at each table cell run's start, a text object of its own, its origin a hair inside the run's
#     leftmost letter (a segment of nothing: joined to its cell it put a space before a word's last letter, «وضعی ت»)
#   · a space glyph drawn at the origin of the letter before it, under it («ورزش‌شناسی» read «ورز ش‌شناسی»), and an
#     isolated yeh after waw drawn over a space of its own («نیروی» read «نیرو ی»)
#   · an empty anchor picture by the quote — black under a soft mask of zeros: it shows nothing (cropped, it was a
#     square of the page)
#   · a page frame of double rules near the page's edges, a table whose outer rule is a few points past its first
#     column's cells and near the frame (taking the frame away took that rule, and the table lost the column)
#   · a clause «2- …» wrapped, its next line set in to where the clause's text starts (a hanging indent: two paragraphs)
# The Markdown that must come back is corpus/booklet-fa.md.
#   python3 scripts/make-acrobat-rtl.py      → pdf/acrobat-word--booklet-fa.pdf, corpus/booklet-fa.md
import os, sys
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rtl_pdf
rtl_pdf.CODES |= {0x200C, 0xAB, 0xBB}
from rtl_pdf import Font, Doc, LAB, REG, BOLD, visual, shape

C = Doc({'F1': Font(REG, 'AAAAAA+DemoNazanin'), 'F2': Font(BOLD, 'AAAAAB+DemoNazanin-Bold')})
W, H = C.w, C.h
R, L0 = 540, 56
def frame(page):
    for d, wd in ((22, 2.2), (27, 0.8)):            # a double frame: a thick rule and a thin one inside it
        C.op(page, '0 g %.1f w %.2f %.2f %.2f %.2f re S' % (wd, d, d, W - 2 * d, H - 2 * d))
for p in (1, 2): frame(p)
def glyph(page, code, name, x, y, size, f):
    F = C.fonts[f]; g = F.gid(code); F.tounicode.setdefault(g, name)
    C.op(page, 'BT /%s %.2f Tf 1 0 0 1 %.3f %.3f Tm <%04X> Tj ET' % (f, size, x, y, g))
def run(page, gl, right, y, size, f, zwnj=False, hidden_spaces=()):
    """a visual run ending at `right`; zwnj: PDFMaker's zero-width ZWNJ at the run's start (its left end), 0.12 inside;
    hidden_spaces: the indexes of spaces drawn under the glyph before them, with no room of their own"""
    w = sum(C.fonts[f].adv(c, size) for k, (c, _) in enumerate(gl) if k not in hidden_spaces)
    x = right - w
    if zwnj: glyph(page, 0x200C, '‌', x + 0.12, y, size, f)
    prev = None
    for k, (c, n) in enumerate(gl):
        if k in hidden_spaces:
            glyph(page, c, n, prev + 0.12, y, size, f); continue
        glyph(page, c, n, x, y, size, f); prev = x
        x += C.fonts[f].adv(c, size)
    return right - w
def word_gl(t):
    out = []
    for k, w in enumerate(reversed(t.split(' '))):
        if k: out.append((0x20, ' '))
        out.extend(reversed(shape(w)))
    return out

# page 1: the quote with an empty picture by it, a heading, the clauses
# (the quote marks drawn as they show — «»» at the right, where the quote opens — and named so: the reader mirrors them)
for t, y in (('» استفاده از دانش و تجربه همکاران در همه بخش‌ها،', 760), ('سفارشی است که همواره تکرار شده است. «', 742)):
    gl = visual(t); C.put(1, gl, 300 - C.width(gl, 12, 'F2') / 2, y, 12, 'F2')
C.ghosts.append((1, 300, 752, 10, 14))
C.line(1, 'مقدمه', 690, 15, 320, 'F2')
C.line(1, 'شرایط عمومی برای ثبت نام در این دوره به شرح زیر است:', 660, 12, R)
C.line(1, '1- داشتن مدرک تحصیلی مرتبط با رشته مورد نظر؛', 636, 12, R)
first = '2- داشتن کارت پایان دوره آموزشی یا گواهی معادل آن؛ امکان ثبت نام برای متقاضیانی'
gl = visual(first)
n = sum(1 for c, _ in gl if c == 0x20)
w = C.width(gl, 12, 'F1'); extra = (R - L0 - w) / n
C.put(1, gl, L0, 612, 12, 'F1', extra)
lead = C.width(visual('2- '), 12, 'F1') + extra       # where the clause's text starts after «2- »
C.line(1, 'که گواهی موقت دارند وجود ندارد؛', 588, 12, R - lead)
# «نیروی»: the isolated yeh drawn over a space glyph of its own, the space under the yeh
t = 'همکاران مرکز نیروی کار و خانواده آنان می‌توانند در این دوره شرکت کنند.'
gl = visual(t)
i = [j for j in range(len(gl) - 1) if gl[j][1] == 'ی' and gl[j + 1][1] == 'و'][0]
gl = gl[:i + 1] + [(0x20, ' ')] + gl[i + 1:]
run(1, gl, R, 560, 12, 'F1', hidden_spaces=(i + 1,))

# page 2: the table — PDFMaker's ZWNJ at each cell run's start, a space under a final letter
TOP, ROW = 760, 40
XS = [44, 150, 330, 470, 548]                # column edges left to right: the right one 8 pt past its cells, near the frame
rows = [('ردیف', 'رشته های مجاز', 'شرایط لازم', 'وضعیت'), ('1', 'ورزش‌شناسی', 'سه سال تجربه کاری', 'تمام وقت')]
for r in range(len(rows) + 1):
    y = TOP - ROW * r; C.op(2, '0 g 0.6 w %.2f %.2f m %.2f %.2f l S' % (XS[0], y, XS[-1], y))
for x in XS: C.op(2, '0 g 0.6 w %.2f %.2f m %.2f %.2f l S' % (x, TOP, x, TOP - ROW * len(rows)))
for r, cells in enumerate(rows):
    y = TOP - ROW * r - 24
    for col, text in zip((3, 2, 1, 0), cells):
        right = XS[col + 1] - (8 if col == 3 else 6)
        f = 'F2' if r == 0 else 'F1'
        if text == 'ورزش‌شناسی':
            # «شناسی» then «دانش»: a ZWNJ and a space drawn at the final sheen's origin, under it
            g1, g2 = list(reversed(shape('شناسی'))), list(reversed(shape('ورزش')))
            gl = g1 + g2[:1] + [(0x200C, '‌'), (0x20, ' ')] + g2[1:]
            run(2, gl, right, y, 12, f, zwnj=True, hidden_spaces=(len(g1) + 1, len(g1) + 2))
        else:
            run(2, visual(text), right, y, 12, f, zwnj=True)
C.write(os.path.join(LAB, 'pdf', 'producers', 'acrobat-word--booklet-fa.pdf'), b'Adobe PDF Library 24.3.212', 'booklet-fa')
open(os.path.join(LAB, 'corpus', 'booklet-fa.md'), 'w').write('''**« استفاده از دانش و تجربه همکاران در همه بخش‌ها،**

**سفارشی است که همواره تکرار شده است. »**

# مقدمه

شرایط عمومی برای ثبت نام در این دوره به شرح زیر است:

1- داشتن مدرک تحصیلی مرتبط با رشته مورد نظر؛

2- داشتن کارت پایان دوره آموزشی یا گواهی معادل آن؛ امکان ثبت نام برای متقاضیانی که گواهی موقت دارند وجود ندارد؛

همکاران مرکز نیروی کار و خانواده آنان می‌توانند در این دوره شرکت کنند.

| ردیف | رشته های مجاز | شرایط لازم | وضعیت |
| --- | --- | --- | --- |
| 1 | ورزش‌شناسی | سه سال تجربه کاری | تمام وقت |
''')
print('corpus/booklet-fa.md')
