# A Persian call for proposals as Word prints it — built by hand, glyph by glyph, each habit on purpose:
#   · a running head over a border rule and a running foot under one, the rules 25 pt from their text on every page
#     (past the 12 pt cut: each came back as a thematic break at the pages' join)
#   · a ruled table whose cells hold lists: Word's level-two bullet «o» in Courier New, a gap after it, an item a line,
#     a long item wrapped under its text (joined as prose: the cell one line, every «o» inline code)
#   · the first column «1) …» in bold, its «)» in the regular face (it read «**1**) **…**»)
# The Markdown that must come back is corpus/cells-fa.md.
#   python3 scripts/make-cells-rtl.py      → pdf/word-cells--cells-fa.pdf, corpus/cells-fa.md
import os, sys
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rtl_pdf
rtl_pdf.CODES |= {ord('o')}
from rtl_pdf import Font, Doc, LAB, REG, BOLD, visual

MONO = '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf'
C = Doc({'F1': Font(REG, 'AAAAAA+DemoMitra'), 'F2': Font(BOLD, 'AAAAAB+DemoMitra-Bold'), 'F3': Font(MONO, 'AAAAAC+CourierNewPSMT')}, w=612, h=792)
R, L0 = 550, 62
for p in (1, 2):
    C.line(p, 'طرح نمونه مدرسه دیجیتال', 745, 11, R)
    C.op(p, '0.8 0 0 RG 1.5 w 0 720.3 m 612 720.3 l S')            # the head's border, 25 pt under its text
    C.op(p, '0.8 0 0 RG 1.5 w 0 61.1 m 612 61.1 l S')              # the foot's, 20 pt over its text
    C.line(p, 'فراخوان نمونه - صفحه %d' % p, 41.5, 10, R)

XS = [62, 175, 430, 550]                 # column edges left to right: مخاطب | پروژه‌ها | محور
def cell_text(page, items, top, right, measure):
    """an item a line: «o» at the right in Courier New, its text 14 pt in; a long item wrapped under its text"""
    y = top - 18
    for it in items:
        C.put(page, [(ord('o'), 'o')], right - C.width([(ord('o'), 'o')], 11, 'F3'), y, 11, 'F3')
        words, cur, lines = it.split(' '), '', []
        for w in words:
            t = (cur + ' ' + w).strip()
            if cur and C.width(visual(t), 11, 'F1') > measure - 14: lines.append(cur); cur = w
            else: cur = t
        lines.append(cur)
        for t in lines:
            C.line(page, t, y, 11, right - 14); y -= 17
    return y
rows = [('1) خدمات آموزشی', ['کتابخانه دیجیتال برای همه دانش‌آموزان مدرسه با امکان جستجو و امانت گرفتن کتاب', 'کلاس مجازی ریاضی', 'ارزیابی پیشرفت درسی'], 'دانش‌آموزان، معلمان'),
        ('2) مدیریت مدرسه', ['سامانه حضور و غیاب', 'برنامه هفتگی کلاس‌ها'], 'مدیران مدارس')]
C.line(1, 'بخش دوم: محورها و پروژه‌ها', 680, 15, R, 'F2')
top = 640
def hline(page, y): C.op(page, '0 g 0.6 w %.2f %.2f m %.2f %.2f l S' % (XS[0], y, XS[-1], y))
hline(1, top)
for k, t in enumerate(('مخاطب هدف', 'زیرمحورها', 'محور اصلی')):
    C.line(1, t, top - 18, 11, XS[k + 1] - 6, 'F2')
for xv in XS: C.op(1, '0 g 0.6 w %.2f %.2f m %.2f %.2f l S' % (xv, top, xv, top - 28))
top -= 28; hline(1, top)
for title, items, who in rows:
    bottom = cell_text(1, items, top, XS[2] - 6, XS[2] - XS[1] - 12)
    # «1) …» in bold, its bracket in the regular face
    n, rest = title.split(') ')
    x = XS[3] - 6 - C.width(visual(n), 11, 'F2'); C.put(1, visual(n), x, top - 18, 11, 'F2')
    x -= C.width([(ord('('), ')')], 11, 'F1'); C.put(1, [(ord('('), ')')], x, top - 18, 11, 'F1')
    x -= C.width([(0x20, ' ')], 11, 'F2'); C.put(1, visual(rest), x - C.width(visual(rest), 11, 'F2'), top - 18, 11, 'F2')
    C.line(1, who, top - 18, 11, XS[1] - 6)
    hline(1, bottom + 6)
    for xv in XS: C.op(1, '0 g 0.6 w %.2f %.2f m %.2f %.2f l S' % (xv, top, xv, bottom + 6))
    top = bottom + 6
C.line(2, 'این فراخوان تا پایان سال باز است و پیشنهادها به نشانی دبیرخانه فرستاده می‌شود.', 680, 11, R)
C.write(os.path.join(LAB, 'pdf', 'producers', 'word-cells--cells-fa.pdf'), b'Microsoft\xae Word for Microsoft 365', 'cells-fa')
open(os.path.join(LAB, 'corpus', 'cells-fa.md'), 'w').write('''# بخش دوم: محورها و پروژه‌ها

| محور اصلی | زیرمحورها | مخاطب هدف |
| --- | --- | --- |
| **1) خدمات آموزشی** | • کتابخانه دیجیتال برای همه دانش‌آموزان مدرسه با امکان جستجو و امانت گرفتن کتاب<br>• کلاس مجازی ریاضی<br>• ارزیابی پیشرفت درسی | دانش‌آموزان، معلمان |
| **2) مدیریت مدرسه** | • سامانه حضور و غیاب<br>• برنامه هفتگی کلاس‌ها | مدیران مدارس |

این فراخوان تا پایان سال باز است و پیشنهادها به نشانی دبیرخانه فرستاده می‌شود.
''')
print('corpus/cells-fa.md')
