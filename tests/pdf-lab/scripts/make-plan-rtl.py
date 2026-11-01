# Two Persian office documents built by hand, glyph by glyph (fontTools, DejaVu Sans subsets), each habit on purpose:
#
# prince-letter--letter-dash.pdf (a letter as Prince sets it, justified):
#   · a number range broken at its dash: a paragraph's line ends «… نامه شماره 451200» and the next starts «– 1403/06/12،»
#     (the line read as a list item, cutting the paragraph in two)
#   · a copy list of «- …» items, the first a full justified line that ends with no stop: the next item stays an item
#
# word-plan--plan-fa.pdf (a research plan's form as Word prints it):
#   · page 1: a border of filled bands round the page (its top band read as a thematic break); a title in a calligraphic
#     font (named Nastaliq, spaces 0.04 em) whose two words touch with no space glyph — «ابزار نوین» read «ابزارنوین»;
#     the words stand apart in the form's text on page 2
#   · page 2: framed boxes of bold «label: value» fields (read as quotes); a row of options, ticked ones as the font's ☑,
#     unticked ones as little pictures wider than their box, the clear part over the label's letters («تألیف☐»); the row's
#     second half a run of spaces away («ترجمه ☐» and «نوع پژوهش: …» read as paragraphs of their own)
# The Markdown that must come back is corpus/letter-dash.md and corpus/plan-fa.md.
#   python3 scripts/make-plan-rtl.py
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rtl_pdf import *                     # FORMS, shape, Font, visual, Doc, LAB, REG, BOLD

# ── the letter ─────────────────────────────────────────────────────────
L = Doc({'F1': Font(REG, 'AAAAAA+LetterSans'), 'F2': Font(BOLD, 'AAAAAB+LetterSans-Bold')})
R, M = 540, 480
L.line(1, 'جناب آقای مدیر واحد نمونه', 760, 12, R, 'F2')
L.line(1, 'موضوع: معرفی نماینده طرح', 738, 12, R, 'F2')
L.line(1, 'با سلام و احترام؛', 716, 12, R)
# (the first line ends at «شماره»; the number before the dash went up with it — «شماره 451200» then «– …»)
PARA = ['به استحضار می‌رساند پیرو جلسه هماهنگی که برگزار شد و طی نامه شماره 451200',
        '– 1403/06/12، طرح نمونه در دستور کار این واحد قرار گرفته است و گزارش آن پس از',
        'بررسی کارشناسان ارسال خواهد شد. همچنین هماهنگی‌های لازم با واحدهای مرتبط انجام',
        'شده است.']
for k, t in enumerate(PARA): L.line(1, t, 690 - 19 * k, 12, R, justify=M if k < len(PARA) - 1 else None)
L.line(1, 'رونوشت :', 560, 11, R)
COPY = ['- معاون محترم برنامه‌ریزی و توسعه منابع جهت استحضار و دستور اقدام در خصوص پیگیری طرح و',
        '- مدیر محترم واحد پشتیبانی، جهت اطلاع']
for k, t in enumerate(COPY): L.line(1, t, 540 - 19 * k, 11, R, justify=M if k == 0 else None)
L.write(os.path.join(LAB, 'pdf', 'producers', 'prince-letter--letter-dash.pdf'), b'Prince 14.3 (www.princexml.com)', 'letter-dash')
open(os.path.join(LAB, 'corpus', 'letter-dash.md'), 'w').write('''**جناب آقای مدیر واحد نمونه**\\
**موضوع: معرفی نماینده طرح**

با سلام و احترام؛

به استحضار می‌رساند پیرو جلسه هماهنگی که برگزار شد و طی نامه شماره 451200 – 1403/06/12، طرح نمونه در دستور کار این واحد قرار گرفته است و گزارش آن پس از بررسی کارشناسان ارسال خواهد شد. همچنین هماهنگی‌های لازم با واحدهای مرتبط انجام شده است.

رونوشت :

-   معاون محترم برنامه‌ریزی و توسعه منابع جهت استحضار و دستور اقدام در خصوص پیگیری طرح و
-   مدیر محترم واحد پشتیبانی، جهت اطلاع
''')

# ── the plan ───────────────────────────────────────────────────────────
P = Doc({'F1': Font(REG, 'AAAAAC+PlanSans'), 'F2': Font(BOLD, 'AAAAAD+PlanSans-Bold'), 'F4': Font(BOLD, 'AAAAAE+IranNastaliqLike')})
P.fonts['F4'].space = 0.04
# page 1: the border, the title
for x0, y0, x1, y1 in ((27, 812, 571, 815), (27, 24, 571, 27), (27, 24, 30, 815), (568, 24, 571, 815)):
    P.op(1, '0.5 0.38 0 rg %.2f %.2f %.2f %.2f re f 0 g' % (x0, y0, x1 - x0, y1 - y0))
P.line(1, 'طرح‌نامه نمونه', 520, 40, 400, 'F4')
# (the two words touch: no space glyph, no room — the calligraphy closed the gap)
gl = visual('ابزار نوین ردیاب'); sp = [k for k, (c, _) in enumerate(gl) if c == 0x20]
F4 = P.fonts['F4']; xr = 420; x = xr - P.width(gl, 40, 'F4') + F4.adv(0x20, 40)
for k, (c, n) in enumerate(gl):
    if k == sp[-1]: continue                       # the space between «ابزار» and «نوین» (visually the rightmost)
    g = F4.gid(c); F4.tounicode.setdefault(g, n)
    P.op(1, 'BT /F4 40.00 Tf 1 0 0 1 %.3f 440.000 Tm <%04X> Tj ET' % (x, g)); x += F4.adv(c, 40)
# page 2: framed boxes
def frame(x0, y0, x1, y1): P.op(2, '0.75 w %.2f %.2f %.2f %.2f re S' % (x0, y0, x1 - x0, y1 - y0))
frame(64, 748, 540, 790)
P.runs(2, [('تاریخ تنظیم:', 'F2'), ('gap', 3.8), ('1403/02/11', 'F1')], 765, 13, 532)
frame(64, 670, 540, 735)
P.runs(2, [('موضوع طرح:', 'F2'), ('gap', 3.8), ('تحقیق ☑ تألیف', 'F1'), ('pic', 10.5), ('gap', 3.8), ('ترجمه', 'F1'), ('pic', 10.5),
           ('gap', 90), ('نوع پژوهش:', 'F2'), ('gap', 3.8), ('بنیادی', 'F1'), ('pic', 10.5), ('gap', 3.8), ('کاربردی ☑', 'F1')], 712, 13, 532)
P.runs(2, [('زبان طرح:', 'F2'), ('gap', 3.8), ('فارسی ☑ عربی ☑ سایر ……………', 'F1')], 686, 13, 532)
frame(64, 560, 540, 655)
P.runs(2, [('عنوان طرح:', 'F2'), ('gap', 3.8), ('توسعه ابزار نوین ردیاب', 'F1')], 630, 13, 532)
P.runs(2, [('سفارش‌دهنده طرح:', 'F2'), ('gap', 3.8), ('واحد نمونه', 'F1')], 600, 13, 532)
P.write(os.path.join(LAB, 'pdf', 'producers', 'word-plan--plan-fa.pdf'), b'Microsoft\xae Word LTSC', 'plan-fa')
open(os.path.join(LAB, 'corpus', 'plan-fa.md'), 'w').write('''# طرح‌نامه نمونه

# ابزار نوین ردیاب

**تاریخ تنظیم:** 1403/02/11

**موضوع طرح:** تحقیق ☑ تألیف ☐ ترجمه ☐

**نوع پژوهش:** بنیادی ☐ کاربردی ☑

**زبان طرح:** فارسی ☑ عربی ☑ سایر ……………

**عنوان طرح:** توسعه ابزار نوین ردیاب\\
**سفارش‌دهنده طرح:** واحد نمونه
''')

# ── the plan's box with a wrapped value (round 26) ─────────────────────
# word-plan--plan-box-fa.pdf: a framed box of bold «label: value» fields as Word prints it, one value a sentence long and
# wrapped over two lines — its second line starts under the label, at the box's edge — then a short field. The wrapped
# line is the value's (one field; the box was read as a quote: its second line has no label), the next label a field of
# its own (after the sentence's full stop: a paragraph)
B = Doc({'F1': Font(REG, 'AAAAAF+PlanSans'), 'F2': Font(BOLD, 'AAAAAG+PlanSans-Bold')})
def bframe(x0, y0, x1, y1): B.op(1, '0.75 w %.2f %.2f %.2f %.2f re S' % (x0, y0, x1 - x0, y1 - y0))
bframe(64, 748, 540, 790)
B.runs(1, [('عنوان طرح:', 'F2'), ('gap', 3.8), ('توسعه ابزار نوین ردیاب', 'F1')], 765, 13, 532)
bframe(64, 640, 540, 735)
B.runs(1, [('هدف طرح:', 'F2'), ('gap', 3.8), ('شناسایی نیازهای واحدها و طراحی ابزاری که گزارش‌های دوره‌ای را بدون', 'F1')], 712, 13, 532)
B.line(1, 'دخالت کاربر از داده‌های موجود تهیه کند و در اختیار مدیران قرار دهد.', 690, 13, 532)
B.runs(1, [('مدت اجرا:', 'F2'), ('gap', 3.8), ('دوازده ماه', 'F1')], 662, 13, 532)
B.line(1, 'این فرم پس از تکمیل به دبیرخانه واحد ارسال شود.', 600, 12, 540)
B.write(os.path.join(LAB, 'pdf', 'producers', 'word-plan--plan-box-fa.pdf'), b'Microsoft\xae Word LTSC', 'plan-box-fa')
open(os.path.join(LAB, 'corpus', 'plan-box-fa.md'), 'w').write('''**عنوان طرح:** توسعه ابزار نوین ردیاب

**هدف طرح:** شناسایی نیازهای واحدها و طراحی ابزاری که گزارش‌های دوره‌ای را بدون دخالت کاربر از داده‌های موجود تهیه کند و در اختیار مدیران قرار دهد.

**مدت اجرا:** دوازده ماه

این فرم پس از تکمیل به دبیرخانه واحد ارسال شود.
''')
