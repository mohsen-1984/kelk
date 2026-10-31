# A Persian circular as a Word export stamped by iText — built by hand, glyph by glyph, each habit on purpose:
#   · the body font's ToUnicode is wrong for a few presentation forms while its cmap is right: medial lam named «ه»,
#     final noon «ج», final and medial yeh named a space, medial heh «ا» («عمه ات» for «عملیات», «ایج» for «این»)
#   · a letterhead deeper than the top band — the office's name and a «ساعت: …» field at 0.87 of the page — at one
#     place on every page (it stayed in the text once a page); its office's name and its number, date and time fields
#     are the letter's own: they come back once, from page 1, in the head's reading order
#   · a clause «مرحله 1: …», «مرحله 2: …» a line each, set in from the right (read as a nested quote, run together)
#   · a diagram between the last «مرحله» line and the next article (the article ran on into the line above it)
#   · an article's line that ends «… عمل کند:» with room left, then «الف) …» a line's pitch below (one line)
# The Markdown that must come back is corpus/circular-fa.md.
#   python3 scripts/make-itext-rtl.py      → pdf/itext-word--circular-fa.pdf, corpus/circular-fa.md
import os, sys
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rtl_pdf import *                     # FORMS, shape, Font, visual, Doc, LAB, REG, BOLD

C = Doc({'F1': Font(REG, 'AAAAAA+CircularNaskh'), 'F2': Font(BOLD, 'AAAAAB+CircularNaskh-Bold')})
F1 = C.fonts['F1']
# the wrong names: the cmap says the form, the ToUnicode another letter
for code, wrong in ((0xFEE0, 'ه'), (0xFEE6, 'ج'), (0xFBFD, ' '), (0xFBFF, ' '), (0xFEEC, 'ا')):
    F1.tounicode[F1.gid(code)] = wrong
R, M = 540, 480
def head(page):
    C.line(page, 'شماره: 15520', 790, 11, 120)
    C.line(page, 'تاریخ: 1403/05/14', 770, 11, 120)
    C.line(page, 'ساعت: 10:15', 738, 11, 120)
    C.line(page, 'اداره نمونه کشور', 738, 20, 380, 'F2')
    C.line(page, 'نشانی: خیابان نمونه، پلاک 12', 30, 9, 540)
for p in (1, 2, 3): head(p)
def para(page, lines, y, size=12, pitch=19):
    for k, t in enumerate(lines):
        C.line(page, t, y - pitch * k, size, R, justify=M if k < len(lines) - 1 else None)
    return y - pitch * len(lines)
# page 1
C.line(1, 'دستورالعمل نمونه برای واحدهای اجرایی', 680, 14, 400, 'F2')
para(1, ['این دستورالعمل برای تدوین برنامه عملیاتی و استقرار نظام داده‌مبنا در واحدهای اجرایی',
         'ابلاغ می‌شود و همه واحدها موظف به اجرای کامل آن در مهلت تعیین شده هستند و گزارش',
         'پیشرفت کار را هر سه ماه به واحد مرکزی ارسال می‌کنند.'], 640)
C.runs(1, [('ماده 1-', 'F2'), ('gap', 3.8), ('اهداف این دستورالعمل به شرح زیر است:', 'F1')], 570, 12, R)
para(1, ['بازطراحی خدمات اجرایی بر پایه تحلیل داده‌های موجود در همه واحدها؛'], 548)
# page 2: the clause lines set in, a diagram, the next article
C.runs(2, [('ماده 2-', 'F2'), ('gap', 3.8), ('واحد اجرایی برای تحقق مراحل زیر اقدام کند:', 'F1')], 690, 12, R)
for k, t in enumerate(['مرحله 1: تعیین وضعیت موجود', 'مرحله 2: تدوین برنامه عملیاتی و تصویب آن توسط واحد مرکزی', 'مرحله 3: آموزش کارکنان و مدیران']):
    C.line(2, t, 668 - 19 * k, 12, R - 36)
C.images.append((2, 70, 380, 460, 220))
C.line(2, 'نمودار- مراحل اجرای طرح', 360, 11, 360, 'F2')
C.runs(2, [('ماده 3-', 'F2'), ('gap', 3.8), ('واحد اجرایی موظف است به ترتیب زیر عمل کند:', 'F1')], 330, 12, R)
C.runs(2, [('الف)', 'F2'), ('gap', 3.8), ('برای تعیین سطح بلوغ خود، جدول شماره (3) را تکمیل و ارسال نماید.', 'F1')], 311, 12, R)
# page 3
para(3, ['واحد مرکزی گزارش‌های رسیده را بررسی و نتیجه را به واحدهای اجرایی اعلام می‌کند و', 'واحدهای اجرایی نسبت به اصلاح برنامه خود اقدام می‌نمایند.'], 690)
C.write(os.path.join(LAB, 'pdf', 'producers', 'itext-word--circular-fa.pdf'), b'iText 5.0.6 (c) 1T3XT BVBA', 'circular-fa')
open(os.path.join(LAB, 'corpus', 'circular-fa.md'), 'w').write('''**اداره نمونه کشور**

شماره: 15520

تاریخ: 1403/05/14

ساعت: 10:15

# دستورالعمل نمونه برای واحدهای اجرایی

این دستورالعمل برای تدوین برنامه عملیاتی و استقرار نظام داده‌مبنا در واحدهای اجرایی ابلاغ می‌شود و همه واحدها موظف به اجرای کامل آن در مهلت تعیین شده هستند و گزارش پیشرفت کار را هر سه ماه به واحد مرکزی ارسال می‌کنند.

**ماده 1-** اهداف این دستورالعمل به شرح زیر است:

بازطراحی خدمات اجرایی بر پایه تحلیل داده‌های موجود در همه واحدها؛

**ماده 2-** واحد اجرایی برای تحقق مراحل زیر اقدام کند:

مرحله 1: تعیین وضعیت موجود

مرحله 2: تدوین برنامه عملیاتی و تصویب آن توسط واحد مرکزی

مرحله 3: آموزش کارکنان و مدیران

**نمودار- مراحل اجرای طرح**

**ماده 3-** واحد اجرایی موظف است به ترتیب زیر عمل کند:

**الف)** برای تعیین سطح بلوغ خود، جدول شماره (3) را تکمیل و ارسال نماید.

واحد مرکزی گزارش‌های رسیده را بررسی و نتیجه را به واحدهای اجرایی اعلام می‌کند و واحدهای اجرایی نسبت به اصلاح برنامه خود اقدام می‌نمایند.
''')
