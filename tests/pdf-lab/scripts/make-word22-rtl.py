# Three Persian pages as Word prints them (Kelk 2.2's rounds) — built by hand, glyph by glyph, each habit on purpose,
# with our own text:
#   · word-frame--frame-table-fa: a page inside an art border (a ring of rules near the page's edges) and a ruled
#     table a few points wider than the text on its start (right) side, its outer rule drawn a piece a row and each
#     row rule carried on to it by a short piece of its own beyond the text — Word's double frame drawn cell by cell.
#     The border's rules are dropped as furniture; the table's frame among them was dropped too, and the first column
#     went with it
#   · word-form--form-box-fa: a table whose first row is one cell across it, a box of «label: value» pairs in three
#     columns and two rows, then the header and the rows. Read as a form (each pair an item, row by row), its rows
#     came after the table: the box inside the table's frame, the XY-cut could not part them
#   · word-nitro--scrambled-fa: a Word subset of a Persian font through another PDF program whose ToUnicode names
#     almost every Arabic glyph by a wrong letter (the cmap, which names the glyphs by their joining forms, is right):
#     read through the ToUnicode the text is gibberish; the forms of touching letters fit only through the cmap
# The Markdown that must come back is corpus/frame-table-fa.md, corpus/form-box-fa.md, corpus/scrambled-fa.md.
#   python3 scripts/make-word22-rtl.py    → pdf/producers/word-frame--frame-table-fa.pdf, word-form--form-box-fa.pdf,
#                                           word-nitro--scrambled-fa.pdf and the three corpus files
import os, sys
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rtl_pdf
rtl_pdf.CODES |= {ord(",")}
from rtl_pdf import Font, Doc, LAB, REG, BOLD, visual

WORD = b'Microsoft\xae Word 2016'
def out(name): return os.path.join(LAB, 'pdf', 'producers', name)
def corpus(name, text): open(os.path.join(LAB, 'corpus', name), 'w').write(text); print('corpus/' + name)
def seg(C, page, x0, y0, x1, y1, w=0.5): C.op(page, '0 g %.2f w %.2f %.2f m %.2f %.2f l S' % (w, x0, y0, x1, y1))

# ---- 1. a table's frame in pieces inside an art border ---------------------------------------------------------------
C = Doc({'F1': Font(REG, 'AAAAAA+DemoNazanin'), 'F2': Font(BOLD, 'AAAAAB+DemoNazanin-Bold')})
W, H = C.w, C.h
R, L0 = 530, 65
# the art border: two rules round the page, 24 and 28 pt in, each side drawn as its own stroke
for d in (24, 28):
    for (x0, y0, x1, y1) in ((d, d, W - d, d), (W - d, d, W - d, H - d), (W - d, H - d, d, H - d), (d, H - d, d, d)):
        C.op(1, '0 0 0.5 RG 1.2 w %.2f %.2f m %.2f %.2f l S' % (x0, y0, x1, y1))
C.line(1, 'گزارش سالانه کتابخانه‌های شهر', 760, 16, 382, 'F2')
para = ['کتابخانه‌های شهر در سال گذشته برنامه‌های تازه‌ای برای جذب اعضا داشتند و شمار اعضای فعال در بیشتر',
        'شعبه‌ها بالا رفت. جدول زیر ظرفیت هر شعبه و شمار اعضای فعال آن را در دو سال پیاپی نشان می‌دهد.']
y = 720
for k, t in enumerate(para):
    C.line(1, t, y, 11, R, justify=None); y -= 19
C.line(1, 'جدول 1- اعضای فعال به تفکیک شعبه', 652, 12, R, 'F2')
# the table: its first (right) column 4 pt past the text's edge (530), its row rules end at 538 and go on to the
# outer rule at 541.5 in a short piece each; the outer rule a piece a row (no rule of its own at 538); the others plain
XS = [70, 150, 230, 310, 410, 538]            # column edges left to right; the frame's outer rule at 541.5
OUT = 541.5
head = ['1403', '1404', 'اعضای فعال', 'ظرفیت', 'شعبه']
rows = [['2,140', '2,385', '2,385', '3,000', 'مرکزی'],
        ['1,210', '1,402', '1,402', '1,800', 'شمال'],
        ['860', '944', '944', '1,200', 'باغ ملی'],
        ['415', '508', '508', '900', 'کودک و نوجوان']]
total = ['4,625', '5,239', '5,239', '6,900', 'جمع']
top, pitch = 630, 22
ys = [top - pitch * k for k in range(len(rows) + 3)]
def rowline(y):
    for k in range(len(XS) - 1): seg(C, 1, XS[k], y, XS[k + 1], y)   # a piece a cell
    seg(C, 1, XS[-1], y, OUT, y)                                      # carried on to the outer rule
for y in ys: rowline(y)
for k in range(len(ys) - 1):
    for xv in XS[:-1]: seg(C, 1, xv, ys[k], xv, ys[k + 1])
    seg(C, 1, OUT, ys[k], OUT, ys[k + 1], 1.5)                        # the outer rule, thicker, a piece a row
def cells(vals, y, f='F1'):
    for k, v in enumerate(vals): C.line(1, v, y, 11, XS[k + 1] - 4, f)
cells(head, ys[0] - 15, 'F2')
for k, r in enumerate(rows): cells(r, ys[k + 1] - 15)
cells(total, ys[len(rows) + 1] - 15, 'F2')
C.line(1, 'شعبه کودک و نوجوان از نیمه سال به ساختمان تازه‌ای رفت و ظرفیت آن بیشتر شد.', ys[-1] - 30, 11, R)
C.write(out('word-frame--frame-table-fa.pdf'), WORD, 'frame-table-fa')
corpus('frame-table-fa.md', '''# گزارش سالانه کتابخانه‌های شهر

کتابخانه‌های شهر در سال گذشته برنامه‌های تازه‌ای برای جذب اعضا داشتند و شمار اعضای فعال در بیشتر شعبه‌ها بالا رفت. جدول زیر ظرفیت هر شعبه و شمار اعضای فعال آن را در دو سال پیاپی نشان می‌دهد.

## جدول 1- اعضای فعال به تفکیک شعبه

| شعبه | ظرفیت | اعضای فعال | 1404 | 1403 |
| --- | --- | --- | --- | --- |
| مرکزی | 3,000 | 2,385 | 2,385 | 2,140 |
| شمال | 1,800 | 1,402 | 1,402 | 1,210 |
| باغ ملی | 1,200 | 944 | 944 | 860 |
| کودک و نوجوان | 900 | 508 | 508 | 415 |
| **جمع** | **6,900** | **5,239** | **5,239** | **4,625** |

شعبه کودک و نوجوان از نیمه سال به ساختمان تازه‌ای رفت و ظرفیت آن بیشتر شد.
''')

# ---- 2. a box of «label: value» pairs as a table's first row ----------------------------------------------------------
C = Doc({'F1': Font(REG, 'AAAAAA+DemoNazanin'), 'F2': Font(BOLD, 'AAAAAB+DemoNazanin-Bold')}, w=841.89, h=595.28)
R2, L2 = 800, 42
C.line(1, 'کتابخانه مرکزی شهر', 545, 15, 470, 'F2')
C.line(1, 'کارنامه امانت کتاب - پاییز 1404', 522, 11, 475)
XS = [L2, 180, 330, 470, 620, R2]
top = 500
# the box: one cell across the table, two rows of three pairs — each pair at its own column of the box
pairs = [[('نام عضو:', 'سارا احمدی'), ('شماره عضویت:', '48210'), ('کد شعبه:', '17')],
         [('نوع عضویت:', 'دانشجویی'), ('شماره کارت:', '109377'), ('تلفن:', '5512')]]
PX = [R2 - 6, 520, 300]                       # each pair's right edge
y = top - 17
for row in pairs:
    for (lab, val), right in zip(row, PX):
        C.runs(1, [(lab, 'F1'), ('gap', 3), (val, 'F1')], y, 11, right)
    y -= 19
box_bottom = y + 2
seg(C, 1, XS[0], top, XS[-1], top); seg(C, 1, XS[0], box_bottom, XS[-1], box_bottom)
seg(C, 1, XS[0], top, XS[0], box_bottom); seg(C, 1, XS[-1], top, XS[-1], box_bottom)
head = ['تاریخ بازگشت', 'تاریخ امانت', 'نویسنده', 'عنوان کتاب', 'ردیف']
rows = [['1404/08/02', '1404/07/18', 'سیمین دانشور', 'سووشون', '1'],
        ['1404/08/20', '1404/08/05', 'هوشنگ گلشیری', 'شازده احتجاب', '2'],
        ['1404/09/11', '1404/08/27', 'محمود دولت‌آبادی', 'جای خالی سلوچ', '3']]
ys = [box_bottom - 22 * k for k in range(len(rows) + 2)]
for yv in ys: seg(C, 1, XS[0], yv, XS[-1], yv)
for xv in XS: seg(C, 1, xv, ys[0], xv, ys[-1])
def cells2(vals, yv, f='F1'):
    for k, v in enumerate(vals): C.line(1, v, yv, 11, XS[k + 1] - 5, f)
cells2(head, ys[0] - 15, 'F2')
for k, r in enumerate(rows): cells2(r, ys[k + 1] - 15)
C.write(out('word-form--form-box-fa.pdf'), WORD, 'form-box-fa')
corpus('form-box-fa.md', '''# کتابخانه مرکزی شهر

کارنامه امانت کتاب - پاییز 1404

-   نام عضو: سارا احمدی
-   شماره عضویت: 48210
-   کد شعبه: 17
-   نوع عضویت: دانشجویی
-   شماره کارت: 109377
-   تلفن: 5512

| ردیف | عنوان کتاب | نویسنده | تاریخ امانت | تاریخ بازگشت |
| --- | --- | --- | --- | --- |
| 1 | سووشون | سیمین دانشور | 1404/07/18 | 1404/08/02 |
| 2 | شازده احتجاب | هوشنگ گلشیری | 1404/08/05 | 1404/08/20 |
| 3 | جای خالی سلوچ | محمود دولت‌آبادی | 1404/08/27 | 1404/09/11 |
''')

# ---- 3. a ToUnicode scrambled throughout -----------------------------------------------------------------------------
# (a bilingual reader: each story in English, then in Persian, in one font — its Latin letters named right, so the
# ToUnicode agrees with the font's cmap on enough glyphs that it is not thrown out whole)
rtl_pdf.CODES |= {ord(c) for c in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ,\'!?'}
C = Doc({'F1': Font(REG, 'AAAAAA+DemoNazanin'), 'F2': Font(BOLD, 'AAAAAB+DemoNazanin-Bold')})
R, L0 = 530, 65
C.line(1, 'داستان‌های کوتاه', 760, 16, 340, 'F2')
stories = [
    (['Once upon a time an old man lived in a small village. He had a big garden, and every morning',
      'he went there early to water his trees. Why do you work so hard, his neighbours asked him.'],
     ['روزی روزگاری در دهکده‌ای کوچک پیرمردی زندگی می‌کرد که باغ بزرگی داشت. هر روز صبح زود به باغ می‌رفت',
      'و به درختان آب می‌داد. همسایه‌ها از او می‌پرسیدند چرا این همه زحمت می‌کشد، و او همیشه می‌گفت که',
      'درخت‌ها مثل بچه‌ها هستند و باید هر روز به آن‌ها سر زد.']),
    (['One year there was no rain, and the spring of the village went dry. Every night the old man',
      'brought water from a far well, and in the autumn his trees were full of fruit for everyone.'],
     ['یک سال باران نبارید و چشمه ده خشک شد. پیرمرد هر شب از چاه دور آب می‌آورد و تا صبح به باغ می‌رسید.',
      'در پاییز همان سال درخت‌های باغ او پر از میوه شدند و همه مردم ده از میوه‌های او خوردند.'])]
y = 720
for en, fa in stories:
    words, cur, ls = ' '.join(en).split(' '), '', []
    gl = lambda t: [(ord(c), c) for c in t]
    for w in words:
        t = (cur + ' ' + w).strip()
        if cur and C.width(gl(t), 11, 'F1') > R - L0: ls.append(cur); cur = w
        else: cur = t
    ls.append(cur)
    for k, t in enumerate(ls):
        n = t.count(' '); extra = (R - L0 - C.width(gl(t), 11, 'F1')) / n if k < len(ls) - 1 and n else 0
        C.put(1, gl(t), L0, y, 11, 'F1', extra); y -= 17
    y -= 10
    words, cur, ls = ' '.join(fa).split(' '), '', []
    for w in words:
        t = (cur + ' ' + w).strip()
        if cur and C.width(visual(t), 11, 'F1') > R - L0: ls.append(cur); cur = w
        else: cur = t
    ls.append(cur)
    for k, t in enumerate(ls): C.line(1, t, y, 11, R, justify=(R - L0) if k < len(ls) - 1 else None); y -= 19
    y -= 14
# (the body font's ToUnicode names each Arabic letter by another — the alphabet shifted by seven, every joining form
# of a letter named the same wrong letter; Latin letters, spaces, digits and marks right. The title's font is right)
ABC = list('ابپتثجچحخدذرزژسشصضطظعغفقکگلمنوهی')
WRONG = {a: ABC[(i + 7) % len(ABC)] for i, a in enumerate(ABC)}
F = C.fonts['F1']
F.tounicode = {g: (WRONG.get(n, n) if len(n) == 1 else n) for g, n in F.tounicode.items()}
C.write(out('word-nitro--scrambled-fa.pdf'), b'Nitro Pro 13', 'scrambled-fa')
corpus('scrambled-fa.md', '# داستان‌های کوتاه\n\n' + '\n\n'.join(' '.join(en) + '\n\n' + ' '.join(fa) for en, fa in stories) + '\n')
