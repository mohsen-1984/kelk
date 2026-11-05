# A Persian Word report page built by hand, glyph by glyph (fontTools, DejaVu Sans subsets, with rtl_pdf.py), for one
# habit (round 26): two short lines on one baseline at the column's two sides — a signature's caption at the far (left)
# side closing the text above, the next table's title at the start (right) side opening the table under it. The two
# ran together into one line («جدول 1: … امضای …»), the table's title lost from its table.
#   python3 scripts/make-sides-rtl.py      → pdf/producers/word-sides--sides-fa.pdf, corpus/sides-fa.md
import os, sys
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rtl_pdf import *                     # FORMS, shape, Font, visual, Doc, LAB, REG, BOLD

D = Doc({'F1': Font(REG, 'AAAAAH+ReportSans'), 'F2': Font(BOLD, 'AAAAAI+ReportSans-Bold')})
R, M = 540, 480
D.line(1, 'گزارش پیشرفت طرح', 770, 16, R, 'F2')
PARA = ['در این دوره کارهای مقدماتی طرح انجام شد و گروه کارشناسی نتایج نخستین بررسی را در',
        'جلسه هماهنگی ارائه کرد. با توجه به پیشرفت کار، برنامه دوره بعد در جدول زیر آمده است و',
        'هر واحد باید اقدام‌های خود را تا پایان ماه آینده گزارش کند.']
for k, t in enumerate(PARA): D.line(1, t, 735 - 19 * k, 12, R, justify=M if k < len(PARA) - 1 else None)
# (one baseline, the column's two sides: the caption at the far side, the table's title at the start side)
# (one paragraph of Word's: the title typed at the start, a run of spaces, the caption — one line of glyphs, spaces and
# all, the caption under the signer's name centred on x = 120)
D.line(1, 'علی نمونه', 680, 12, 120 + D.width(visual('علی نمونه'), 12, 'F1') / 2)
cap, title = visual('امضای مسئول واحد'), visual('جدول 1: برنامه دوره بعد')
x0 = 120 - D.width(cap, 12, 'F1') / 2
gap = R - D.width(title, 12, 'F1') - (x0 + D.width(cap, 12, 'F1'))
n = int(gap / D.fonts['F1'].adv(0x20, 12))
D.put(1, cap + [(0x20, ' ')] * n + title, x0 + gap - n * D.fonts['F1'].adv(0x20, 12), 660, 12, 'F1')
XS = [60, 200, 400, 540]
ROWS = [('ردیف', 'اقدام', 'مسئول'), ('1', 'تکمیل فهرست داده‌ها', 'واحد برنامه'), ('2', 'آزمون نسخه نخست', 'واحد فنی'), ('3', 'تهیه گزارش نهایی', 'گروه کارشناسی')]
top = 645
for r, cells in enumerate(ROWS):
    for c in range(3):
        x0, x1 = XS[c], XS[c + 1]
        D.op(1, '0.75 w %.2f %.2f %.2f %.2f re S' % (x0, top - 22, x1 - x0, 22))
    for col, val in zip((2, 1, 0), cells):
        D.line(1, val, top - 15, 11, XS[col + 1] - 6, 'F2' if r == 0 else 'F1')
    top -= 22
D.line(1, 'نتیجه هر اقدام در گزارش ماه آینده آورده خواهد شد.', top - 30, 12, R)
D.write(os.path.join(LAB, 'pdf', 'producers', 'word-sides--sides-fa.pdf'), b'Microsoft\xae Word 2019', 'sides-fa')
open(os.path.join(LAB, 'corpus', 'sides-fa.md'), 'w').write('''# گزارش پیشرفت طرح

در این دوره کارهای مقدماتی طرح انجام شد و گروه کارشناسی نتایج نخستین بررسی را در جلسه هماهنگی ارائه کرد. با توجه به پیشرفت کار، برنامه دوره بعد در جدول زیر آمده است و هر واحد باید اقدام‌های خود را تا پایان ماه آینده گزارش کند.

علی نمونه\\
امضای مسئول واحد

**جدول 1: برنامه دوره بعد**

| ردیف | اقدام | مسئول |
| --- | --- | --- |
| 1 | تکمیل فهرست داده‌ها | واحد برنامه |
| 2 | آزمون نسخه نخست | واحد فنی |
| 3 | تهیه گزارش نهایی | گروه کارشناسی |

نتیجه هر اقدام در گزارش ماه آینده آورده خواهد شد.
''')
