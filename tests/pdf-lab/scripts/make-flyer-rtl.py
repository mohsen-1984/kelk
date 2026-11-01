# A one-page Persian flyer as Word prints it — built by hand, glyph by glyph, each habit on purpose:
#   · an art page border: a ring of small tiles round the page, each filled and outlined, every 18 pt along each edge
#     (the outlines along the top and the bottom are vertical rules at a steady pitch: the page came back as one
#     ruled table of 28 columns, every line cut into its cells)
#   · a note that ends a sentence at 11 pt, then a line «وسایل لازم : …» whose label is set at 11 pt and its list at
#     13 pt, filling the column (the sizes did not tell: one paragraph), then two centred field lines at 13 pt
#     (read as one `##` heading)
#   · a date in a right-to-left line drawn with a space glyph under each «/» (it read «08/ 02/ 1403»)
# The Markdown that must come back is corpus/flyer-fa.md.
#   python3 scripts/make-flyer-rtl.py      → pdf/word-flyer--flyer-fa.pdf, corpus/flyer-fa.md
import os, sys
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rtl_pdf
rtl_pdf.CODES |= {0x25AA}
from rtl_pdf import Font, Doc, LAB, REG, BOLD, visual

C = Doc({'F1': Font(REG, 'AAAAAA+DemoNazanin'), 'F3': Font(BOLD, 'AAAAAB+DemoTitr-Bold')})
R, L0 = 530, 65                                   # the text column
W, H = C.w, C.h
# the art border: tiles of 18 pt round the page, 24 pt in from its edges
def tile(x, y):
    C.op(1, '1 g %.2f %.2f 18 18 re f' % (x, y))
    # (its outline as four strokes, as Word draws it: the vertical ones along the top and the bottom are the rules)
    C.op(1, '0 0 0.5 RG 0.6 w %.2f %.2f m %.2f %.2f l %.2f %.2f m %.2f %.2f l %.2f %.2f m %.2f %.2f l %.2f %.2f m %.2f %.2f l S' %
         (x, y, x + 18, y, x, y + 18, x + 18, y + 18, x, y, x, y + 18, x + 18, y, x + 18, y + 18))
    C.op(1, '1 0 0 rg %.2f %.2f 5 5 re f' % (x + 3, y + 3))
x = 24
while x + 18 <= W - 24: tile(x, 24); tile(x, H - 42); x += 18.2
y = 42
while y + 18 <= H - 42: tile(24, y); tile(W - 42, y); y += 18.2

def centred(text, y, size, f):
    gl = visual(text); C.put(1, gl, (L0 + R) / 2 - C.width(gl, size, f) / 2, y, size, f)
def wrap(text, size, f, measure):
    lines, cur = [], ''
    for w in text.split(' '):
        t = (cur + ' ' + w).strip()
        if cur and C.width(visual(t), size, f) > measure: lines.append(cur); cur = w
        else: cur = t
    return lines + [cur]
def para(text, y, size=11, f='F1', right=R, pitch=20, first=None):
    # (first: the first line's own start — a note's first line set in as far as the items' text, the rest at the margin)
    first = right if first is None else first
    ls, cur = [], ''
    for w in text.split(' '):
        t = (cur + ' ' + w).strip()
        if cur and C.width(visual(t), size, f) > (first if not ls else right) - L0: ls.append(cur); cur = w
        else: cur = t
    ls.append(cur)
    for k, t in enumerate(ls):
        r = first if k == 0 else right
        C.line(1, t, y - pitch * k, size, r, f, justify=(r - L0) if k < len(ls) - 1 else None)
    return y - pitch * len(ls)

centred('برنامه پیاده روی پارک نمونه', 760, 16, 'F3')
centred('رعایت نکات زیر برای همه شرکت کنندگان لازم است.', 720, 12, 'F3')
y = 690
for t in ['همه همکاران و خانواده آنان می‌توانند پس از ثبت نام در این برنامه شرکت کنند و همراه داشتن کارت شناسایی برای همه شرکت کنندگان الزامی است.',
          'حرکت از محل باشگاه در ساعت مقرر انجام می‌شود و همکاران ده دقیقه پیش از آن در محل حضور یابند.',
          'این برنامه در صورت مساعد بودن هوا برگزار خواهد شد.']:
    C.put(1, [(0x25AA, '▪')], R - 8, y, 11, 'F1')
    y = para(t, y, right=R - 20) - 4
y = para('نکته) هر شرکت کننده یک کوله پشتی سبک همراه داشته باشد که در آن آب و کمی خوراکی باشد و زباله‌ای در طبیعت رها نکند.', y, first=R - 21)
# the label at 11 pt, its list at 13 pt, the line filled to the column by its word gaps
y -= 6
lab, items = visual('وسایل لازم :'), visual('کفش مناسب، کلاه، عینک، بطری آب، لباس گرم، . . .')
wl, wi = C.width(lab, 11, 'F3'), C.width(items, 13, 'F3')
gaps = sum(1 for c, _ in items if c == 0x20) + 1
extra = (R - L0 - wl - wi) / gaps
assert extra > 0, (wl + wi, R - L0)
x = R - wl
C.put(1, lab, x, y, 11, 'F3')
C.put(1, items, x - extra - wi - extra * (gaps - 1), y, 13, 'F3', extra)
centred('زمان حضور: ساعت 6:30 روز پنجشنبه 1403/02/10', y - 28, 13, 'F3')
centred('محل حضور: درب اصلی پارک نمونه', y - 52, 13, 'F3')
# a date drawn with a space glyph under each «/»: the slash set where the space starts
y -= 92
tail = visual('از طریق سامانه رفاهی انجام می‌شود.')
head_ = visual('ثبت نام تا روز سه شنبه')
x = R - C.width(head_, 11, 'F1'); C.put(1, head_, x, y, 11, 'F1')
x -= C.width([(0x20, ' ')], 11, 'F1')
F1 = C.fonts['F1']
date = [('1403', None), ('/', ' '), ('02', None), ('/', ' '), ('08', None)]
wd = sum(C.width([(ord(c), c) for c in t], 11, 'F1') for t, _ in date)
x -= wd
for t, sp in date:
    if sp: C.put(1, [(0x20, ' ')], x, y, 11, 'F1')       # the space, under the slash
    x = C.put(1, [(ord(c), c) for c in t], x, y, 11, 'F1')
x = R - C.width(head_, 11, 'F1') - C.width([(0x20, ' ')], 11, 'F1') - wd - C.width([(0x20, ' ')], 11, 'F1')
C.put(1, tail, x - C.width(tail, 11, 'F1'), y, 11, 'F1')
C.write(os.path.join(LAB, 'pdf', 'producers', 'word-flyer--flyer-fa.pdf'), b'Microsoft\xae Word LTSC', 'flyer-fa')
open(os.path.join(LAB, 'corpus', 'flyer-fa.md'), 'w').write('''# برنامه پیاده روی پارک نمونه

**رعایت نکات زیر برای همه شرکت کنندگان لازم است.**

-   همه همکاران و خانواده آنان می‌توانند پس از ثبت نام در این برنامه شرکت کنند و همراه داشتن کارت شناسایی برای همه شرکت کنندگان الزامی است.
-   حرکت از محل باشگاه در ساعت مقرر انجام می‌شود و همکاران ده دقیقه پیش از آن در محل حضور یابند.
-   این برنامه در صورت مساعد بودن هوا برگزار خواهد شد.

نکته) هر شرکت کننده یک کوله پشتی سبک همراه داشته باشد که در آن آب و کمی خوراکی باشد و زباله‌ای در طبیعت رها نکند.

**وسایل لازم : کفش مناسب، کلاه، عینک، بطری آب، لباس گرم، . . .**

**زمان حضور: ساعت 6:30 روز پنجشنبه 1403/02/10**\\
**محل حضور: درب اصلی پارک نمونه**

ثبت نام تا روز سه شنبه 1403/02/08 از طریق سامانه رفاهی انجام می‌شود.
''')
print('corpus/flyer-fa.md')
