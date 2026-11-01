# A Persian circular on a Word letterhead, as Word prints it — built by hand, glyph by glyph, each habit on purpose:
#   · the letterhead on every page, made as a table: the letter's fields at the left — a label in a calligraphic font
#     and its value a cell apart on the same baseline («شماره نامه:» … «24816») —, the office's name in the middle
#     under a logo (a picture), its head's title down the right in three lines («معاون وزیر» / «و» / «رئیس اداره»);
#     the fields went with the running head, and kept they came out row by row across the head
#   · the office's name typed with a ZWNJ to shape the calligraphy («آموزش‌ی»; the body says «آموزشی»)
#   · the last field's value drawn with a ZWNJ on the last page only (it was no repeat there, and stayed in the text)
#   · the invocation in the calligraphic font, its two words touching («باسمه» «تعالی» with no space: it came back as
#     «# باسمه‌تعالی»)
#   · a numbered section title «2. …:» set in bold over bullet items set further in (a list of one, the items its
#     children), its sibling «1. …» over a lettered sub-title
# The Markdown that must come back is corpus/memo-fa.md.
#   python3 scripts/make-memo-rtl.py      → pdf/word-memo--memo-fa.pdf, corpus/memo-fa.md
import os, sys
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rtl_pdf
rtl_pdf.CODES |= {0x200C, 0x25AA}
from rtl_pdf import Font, Doc, LAB, REG, BOLD, visual, shape

C = Doc({'F1': Font(REG, 'AAAAAA+DemoMitra'), 'F2': Font(REG, 'AAAAAB+DemoNastaliq'), 'F3': Font(BOLD, 'AAAAAC+DemoMitra-Bold')})
R = 540
ZW = (0x200C, '‌')
def word(w):
    """a word in visual order, a typed ZWNJ drawn as a glyph of its own"""
    parts = w.split('‌'); seq = []
    for k, p in enumerate(parts):
        if k: seq.append(ZW)
        seq.extend(shape(p))
    return list(reversed(seq))
def at(page, gl, right, y, size, f):
    x = right - C.width(gl, size, f); C.put(page, gl, x, y, size, f); return x
def centred(page, gl, cx, y, size, f): return at(page, gl, cx + C.width(gl, size, f) / 2, y, size, f)

FIELDS = [('شماره نامه:', '24816'), ('تاریخ نامه:', '1403/11/20'), ('ساعت:', '09:40'), ('پیوست:', 'ندارد'), ('فوریت:', 'عادی')]
def head(page, last):
    for k, (label, value) in enumerate(FIELDS):
        y = 780 - 24 * k
        at(page, visual(label), 145, y, 9, 'F2')
        gl = word('عا‌دی') if (last and value == 'عادی') else visual(value)
        at(page, gl, 80, y, 12, 'F1')
    for t, y in (('معاون وزیر', 780), ('و', 756), ('رئیس اداره', 726)):
        centred(page, visual(t), 512, y, 18, 'F2')
    gl = []
    for w in reversed('اداره کل نمونه و آموزش‌ی کشور'.split(' ')):
        if gl: gl.append((0x20, ' '))
        gl.extend(word(w))
    centred(page, gl, 310, 730, 16, 'F2')
    C.images.append((page, 295, 752, 24, 30))                 # the logo (the lab's box picture), at one place on every page
    C.line(page, 'نشانی: خیابان نمونه، پلاک 7', 40, 9, R)
for p in (1, 2, 3): head(p, p == 3)

def para(page, text, y, f='F1', pitch=19, right=R):
    lines, cur = [], ''
    for w in ' '.join(text).split(' '):                      # wrapped to the measure, as Word fills its lines
        t = (cur + ' ' + w).strip()
        if cur and C.width(visual(t), 12, f) > 480 - (R - right): lines.append(cur); cur = w
        else: cur = t
    lines.append(cur)
    for k, t in enumerate(lines):
        C.line(page, t, y - pitch * k, 12, right, f, justify=480 - (R - right) if k < len(lines) - 1 else None)
    return y - pitch * len(lines)
# page 1: the invocation — two words touching, no space glyph
centred(1, word('تعالی') + word('باسمه'), 300, 640, 18, 'F2')
C.line(1, 'همه واحدهای اجرایی تابعه', 600, 12, R, 'F3')
y = para(1, ['در اجرای برنامه آموزشی سالانه و به منظور هماهنگی واحدهای تابعه در تدوین برنامه عملیاتی، دستورالعمل',
             'زیر برای اجرا ابلاغ می‌شود و واحدها گزارش اقدامات خود را در پایان هر فصل ارسال می‌کنند.'], 570)
C.line(1, '1. موارد همکاری', y - 14, 12, R, 'F3')
C.line(1, 'الف) دوره‌های آموزشی مشترک:', y - 40, 12, R, 'F3')
para(1, ['واحدها دوره‌های آموزشی مشترک را با هماهنگی واحد مرکزی برگزار می‌کنند و فهرست شرکت کنندگان را پیش',
         'از شروع هر دوره ارسال می‌نمایند.'], y - 64)
# page 2: a numbered title over bullet items set in
C.line(2, '2. درخواست از واحد مرکزی:', 640, 12, R, 'F3')
for k, t in enumerate(['برنامه زمانی دوره‌ها پیش از آغاز هر فصل اعلام شود؛',
                       'امکان بازدید کارشناسان از واحدهای پیشرو فراهم شود؛',
                       'نتایج ارزیابی دوره‌ها به همه واحدها ارسال شود.']):
    yy = 610 - 26 * k
    at(2, [(0x25AA, '▪')], R - 18, yy, 12, 'F1')
    C.line(2, t, yy, 12, R - 36)
para(2, ['واحد مرکزی آمادگی دارد برای اجرای برنامه آموزشی هر واحد، کارشناسان خود را در اختیار واحدها قرار دهد.'], 510)
# page 3: the signature
C.line(3, 'مدیر واحد مرکزی', 600, 12, 180, 'F3')
C.write(os.path.join(LAB, 'pdf', 'producers', 'word-memo--memo-fa.pdf'), b'Microsoft\xae Word 2019', 'memo-fa')
open(os.path.join(LAB, 'corpus', 'memo-fa.md'), 'w').write('''معاون وزیر و رئیس اداره

اداره کل نمونه و آموزشی کشور

شماره نامه: 24816

تاریخ نامه: 1403/11/20

ساعت: 09:40

پیوست: ندارد

فوریت: عادی

باسمه تعالی

**همه واحدهای اجرایی تابعه**

در اجرای برنامه آموزشی سالانه و به منظور هماهنگی واحدهای تابعه در تدوین برنامه عملیاتی، دستورالعمل زیر برای اجرا ابلاغ می‌شود و واحدها گزارش اقدامات خود را در پایان هر فصل ارسال می‌کنند.

**1\\. موارد همکاری**

**الف) دوره‌های آموزشی مشترک:**

واحدها دوره‌های آموزشی مشترک را با هماهنگی واحد مرکزی برگزار می‌کنند و فهرست شرکت کنندگان را پیش از شروع هر دوره ارسال می‌نمایند.

**2\\. درخواست از واحد مرکزی:**

-   برنامه زمانی دوره‌ها پیش از آغاز هر فصل اعلام شود؛
-   امکان بازدید کارشناسان از واحدهای پیشرو فراهم شود؛
-   نتایج ارزیابی دوره‌ها به همه واحدها ارسال شود.

واحد مرکزی آمادگی دارد برای اجرای برنامه آموزشی هر واحد، کارشناسان خود را در اختیار واحدها قرار دهد.

**مدیر واحد مرکزی**
''')
print('corpus/memo-fa.md')
