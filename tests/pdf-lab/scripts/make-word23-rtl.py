# Two Persian Word tables as Word prints them (Kelk 2.3's cases, from real files' habits; our own text):
#   · word-longcells--long-cells-fa: a three-column table over two pages — a cell of dash items, one a line, a long
#     one wrapped; the header row repeated on the second page; a row cut by the page break, its second half on the
#     next page with its first cell empty; a cell of numbered items, each number at the cell's edge and its lines
#     hanging 16 pt in. The items run together into one line (no `<br>`); the numbers, a column of their own, give
#     the part on the second page a column more, and it is not joined to the first
#   · word-merged--merged-cells-fa: a table whose first column has cells merged over two and three rows, a header
#     band over the last three columns above the header row, and a band across the last three columns between two
#     groups of rows. The merged cell's value stands in its first row only (the rows under it look empty), the
#     header band becomes a paragraph over the table, the inner band one bold cell in the middle of a row
#     (the corpus file follows the decision in TODO.md: a merged value repeated in each of its rows, a band a row of
#     its own with its text bold in the first cell, a band over the header a paragraph over the table)
# The Markdown that must come back is corpus/long-cells-fa.md and corpus/merged-cells-fa.md.
#   python3 scripts/make-word23-rtl.py    → pdf/producers/word-longcells--long-cells-fa.pdf,
#                                           word-merged--merged-cells-fa.pdf and their corpus files
import os, sys
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rtl_pdf
from rtl_pdf import Font, Doc, LAB, REG, BOLD, visual

WORD = b'Microsoft\xae Word 2019'
def out(name): return os.path.join(LAB, 'pdf', 'producers', name)
def corpus(name, text): open(os.path.join(LAB, 'corpus', name), 'w').write(text); print('corpus/' + name)
def seg(C, page, x0, y0, x1, y1, w=0.5): C.op(page, '0 g %.2f w %.2f %.2f m %.2f %.2f l S' % (w, x0, y0, x1, y1))
def fonts(): return {'F1': Font(REG, 'AAAAAA+DemoNazanin'), 'F2': Font(BOLD, 'AAAAAB+DemoNazanin-Bold')}
def wrap(C, text, measure, size=10, f='F1'):
    words, cur, ls = text.split(' '), '', []
    for w in words:
        t = (cur + ' ' + w).strip()
        if cur and C.width(visual(t), size, f) > measure: ls.append(cur); cur = w
        else: cur = t
    return ls + [cur]

# ---- 1. long cells over two pages --------------------------------------------------------------------------------------
C = Doc(fonts())
XS = [62, 170, 450, 533]                      # زمان‌بندی | شرح اقدامات | مرحله (left to right)
PITCH = 15
# (the report's text above the table, so that the table reaches the foot of page 1 and the page breaks inside the
# «ویژه» row, before its third numbered item)
INTRO = ['کتابخانه مرکزی دانشکده در سال گذشته طرحی را آغاز کرد تا کتاب‌های خود را به شکل دیجیتال در دسترس اعضا بگذارد. این طرح با پشتیبانی شورای دانشکده و با کمک گروهی از دانشجویان داوطلب پیش می‌رود و هدف آن نگهداری بهتر کتاب‌های کمیاب و دسترسی آسان‌تر به همه کتاب‌هاست.',
         'کار در چند مرحله انجام می‌شود و هر مرحله زمان‌بندی جداگانه دارد. در هر مرحله یک نفر از کارکنان کتابخانه مسئول پیشبرد کارها و تهیه گزارش است. گزارش هر مرحله پیش از آغاز مرحله بعد به کمیته کتابخانه داده می‌شود و کمیته درباره ادامه کار تصمیم می‌گیرد.',
         'برای این طرح دو دستگاه اسکن تازه خریداری شده است و یک اتاق کوچک در طبقه دوم برای کار با نسخه‌های خطی آماده شده است. نرم‌افزار نویسه‌خوان فارسی نیز روی رایانه‌های کتابخانه نصب شده است و دانشجویان داوطلب کار با آن را در دو جلسه آموزشی یاد گرفته‌اند.',
         'هزینه طرح از بودجه سالانه کتابخانه و کمک یکی از انجمن‌های دانش‌آموختگان دانشکده پرداخت می‌شود. بخشی از این هزینه برای خرید دیسک‌های پشتیبان و بخشی برای پرداخت دستمزد ویراستاری است که متن‌های خوانده‌شده را بازبینی می‌کند.',
         'جدول زیر مراحل کار، شرح اقدامات هر مرحله و زمان‌بندی آن را نشان می‌دهد. مرحله ویژه به نسخه‌های خطی می‌پردازد و پس از مرحله سوم انجام می‌شود.']
y = 770
for para in INTRO:
    ls = wrap(C, para, XS[-1] - XS[0], 11)
    for k, l in enumerate(ls): C.line(1, l, y, 11, XS[-1], justify=(XS[-1] - XS[0]) if k < len(ls) - 1 else None); y -= 19
    y -= 8
TOP = 413
C.line(1, 'جدول 2- مراحل راه‌اندازی کتابخانه دیجیتال', TOP + 20, 12, 470, 'F2')
assert y > TOP + 30, ('the text above runs into the table', y)
head = ['زمان‌بندی', 'شرح اقدامات', 'مرحله']
rows = [('اول', ['- فهرست کتاب‌های موجود تهیه می‌شود.', '- کتاب‌های کمیاب برای اسکن جدا می‌شوند و فهرست آنها به کمیته فرستاده می‌شود تا ترتیب اسکن را تعیین کند.', '- برای هر کتاب یک برگه مشخصات ساخته می‌شود.'], 'ماه اول'),
        ('دوم', ['- کتاب‌ها اسکن و با نام استاندارد ذخیره می‌شوند.', '- متن هر صفحه با نویسه‌خوان خوانده و بازبینی می‌شود.', '- خطاهای نویسه‌خوان در هر کتاب فهرست می‌شود و به ویراستار سپرده می‌شود تا پیش از انتشار درست شود.', '- نسخه پشتیبان هر هفته روی دو دیسک جدا گرفته می‌شود.', '- گزارش پیشرفت هر ماه به کمیته داده می‌شود.'], 'ماه دوم تا ششم'),
        ('ویژه', ['در این مرحله کارهای زیر به ترتیب انجام می‌شود:', '1) اسکن نسخه‌های خطی: هر نسخه با نور کم و بدون باز کردن کامل جلد اسکن می‌شود تا آسیبی به آن نرسد و تصویر هر برگ جداگانه نگهداری شود.',
                  '2) نمایه‌سازی: برای هر نسخه نام نویسنده، تاریخ کتابت و موضوع آن ثبت می‌شود و نمایه با فهرست کتابخانه ملی سنجیده می‌شود.',
                  '3) انتشار: نسخه‌هایی که حق نشر آزاد دارند با کیفیت کامل و بقیه با کیفیت کم منتشر می‌شوند.'], 'ماه هشتم تا دهم'),
        ('سوم', ['- کتابخانه دیجیتال برای اعضا باز می‌شود.', '- نظر اعضا گردآوری و در طرح سال بعد آورده می‌شود.'], 'ماه هفتم')]
def header(page, top):
    for k, t in enumerate(head): C.line(page, t, top - 14, 10, XS[k + 1] - 5, 'F2')
    return top - 20
def hl(page, y): seg(C, page, XS[0], y, XS[-1], y)
def vl(page, y0, y1):
    for x in XS: seg(C, page, x, y0, x, y1)
page, top, bottom_limit = 1, TOP, 120
hl(page, top); y = header(page, top); hl(page, y); vl(page, top, y)
for name, items, when in rows:
    # (a numbered item «1) …» hangs: its number at the cell's edge, its lines 16 pt in — the numbers a column of
    # their own down the cell)
    lines = []
    for it in items:
        num = it.split(' ')[0] if it[:1].isdigit() else None
        if num:
            ls = wrap(C, it[len(num) + 1:], XS[2] - XS[1] - 26)
            lines += [(num, ls[0])] + [(None, l) for l in ls[1:]]
        else:
            lines += [('', l) for l in wrap(C, it, XS[2] - XS[1] - 10)]
    row_top, first = y, True
    yy = y - 14
    C.line(page, name, yy, 10, XS[3] - 5, 'F2'); C.line(page, when, yy, 10, XS[1] - 5)
    for l in lines:
        if yy < bottom_limit:                  # the page breaks inside the row: its rules close here, it goes on
            hl(page, yy + PITCH - 6 - 1); vl(page, row_top, yy + PITCH - 7)
            page, top = page + 1, 760
            hl(page, top); y = header(page, top); hl(page, y); vl(page, top, y)
            row_top, yy = y, y - 14
        num, text = l
        if num is None: C.line(page, text, yy, 10, XS[2] - 21)
        elif num:
            # (the number's closing bracket at its left, drawn mirrored and named logically — Word's)
            gl = [(ord('('), ')')] + [(ord(c), c) for c in num[:-1]]
            C.put(page, gl, XS[2] - 5 - C.width(gl, 10, 'F2'), yy, 10, 'F2'); C.line(page, text, yy, 10, XS[2] - 21)
        else: C.line(page, text, yy, 10, XS[2] - 5)
        yy -= PITCH
    y = yy + PITCH - 7
    hl(page, y); vl(page, row_top, y)
C.line(page, 'پایان هر مرحله با گزارش کمیته تأیید می‌شود.', y - 30, 11, 533)
C.write(out('word-longcells--long-cells-fa.pdf'), WORD, 'long-cells-fa')
cell = lambda items: '<br>'.join(items)
corpus('long-cells-fa.md', ''.join(p + '\n\n' for p in INTRO) + '**جدول 2- مراحل راه‌اندازی کتابخانه دیجیتال**\n\n| مرحله | شرح اقدامات | زمان‌بندی |\n| --- | --- | --- |\n' +
       ''.join('| **%s** | %s | %s |\n' % (n, cell(it), w) for n, it, w in rows) + '\nپایان هر مرحله با گزارش کمیته تأیید می‌شود.\n')

# ---- 2. merged cells ----------------------------------------------------------------------------------------------------
C = Doc(fonts())
XS = [62, 200, 330, 450, 533]                 # روش اندازه‌گیری | پایه | نوع | گروه (left to right)
C.line(1, 'جدول 3- روش اندازه‌گیری دارایی‌های کتابخانه', 760, 12, 470, 'F2')
P = 22
top = 740
band_top = ['اندازه‌گیری']                    # over the last three columns (left)
head = ['روش اندازه‌گیری', 'پایه', 'نوع دارایی', 'گروه']
body = [[('کتاب‌های چاپی', 2), ('قیمت خرید', 'سالانه', 'کتاب درسی'), ('قیمت روز', 'سالانه', 'کتاب کمیاب')],
        [('تجهیزات', 3), ('قیمت خرید', 'ماهانه', 'رایانه'), ('قیمت خرید', 'سالانه', 'قفسه'), ('ارزش دفتری', 'سالانه', 'خودرو')]]
band_mid = 'نگهداری'
body2 = [[('اشتراک‌ها', 2), ('هزینه سالانه', 'سالانه', 'پایگاه داده'), ('هزینه سالانه', 'سالانه', 'مجله')]]
y = top
seg(C, 1, XS[0], y, XS[-1], y)
# the header band: one cell over the last three columns, the first column's header cell merged over both header rows
C.line(1, band_top[0], y - 15, 10, (XS[0] + XS[3]) / 2 + C.width(visual(band_top[0]), 10, 'F2') / 2, 'F2')
seg(C, 1, XS[0], y - P, XS[3], y - P)
for x in (XS[0], XS[3], XS[4]): seg(C, 1, x, y, x, y - 2 * P)
C.line(1, head[3], y - P - 4, 10, XS[4] - 5, 'F2')
y -= P
for k in range(3): C.line(1, head[k], y - 15, 10, XS[k + 1] - 5, 'F2')
for x in XS[1:3]: seg(C, 1, x, y, x, y - P)
y -= P
seg(C, 1, XS[0], y, XS[-1], y)
def group(rows_, y):
    for (label, n), *rs in [r for r in rows_]:
        g_top = y
        for r in rs:
            for k, v in enumerate(r): C.line(1, v, y - 15, 10, XS[k + 1] - 5)
            for x in XS[:4]: seg(C, 1, x, y, x, y - P)
            y -= P
            seg(C, 1, XS[0], y, XS[3], y)
        seg(C, 1, XS[3], y, XS[4], y); seg(C, 1, XS[4], g_top, XS[4], y)
        C.line(1, label, (g_top + y) / 2 - 4, 10, XS[4] - 5)          # the merged cell's text, centred in its rows
    return y
y = group(body, y)
# the inner band: one cell over the last three columns, the first column's cell beside it empty
C.line(1, band_mid, y - 15, 10, (XS[0] + XS[3]) / 2 + C.width(visual(band_mid), 10, 'F2') / 2, 'F2')
for x in (XS[0], XS[3], XS[4]): seg(C, 1, x, y, x, y - P)
y -= P
seg(C, 1, XS[0], y, XS[-1], y)
y = group(body2, y)
C.line(1, 'ارزش کتاب‌های کمیاب هر سال به قیمت روز بازنگری می‌شود.', y - 30, 11, 533)
C.write(out('word-merged--merged-cells-fa.pdf'), WORD, 'merged-cells-fa')
rowsmd = ''
for g in body:
    (label, n), *rs = g
    for r in rs: rowsmd += '| %s | %s | %s | %s |\n' % (label, r[2], r[1], r[0])
rowsmd += '| **%s** |  |  |  |\n' % band_mid
for g in body2:
    (label, n), *rs = g
    for r in rs: rowsmd += '| %s | %s | %s | %s |\n' % (label, r[2], r[1], r[0])
corpus('merged-cells-fa.md', '**جدول 3- روش اندازه‌گیری دارایی‌های کتابخانه**\n\n**اندازه‌گیری**\n\n| گروه | نوع دارایی | پایه | روش اندازه‌گیری |\n| --- | --- | --- | --- |\n' +
       rowsmd + '\nارزش کتاب‌های کمیاب هر سال به قیمت روز بازنگری می‌شود.\n')
