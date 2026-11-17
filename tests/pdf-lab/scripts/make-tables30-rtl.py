# A yearly report's tables and lines as Word prints them, for the tables and the lines work of 3.0
# (rtl_pdf2.py; DejaVu Sans subsets; text of our own). From real reports' habits:
#   · word-report--ruled-header-fa: a borderless table — only its header ruled, a short rule under each column's title —
#     whose body cells hold one or two centred lines, centred in their row; a column left empty for signatures (it came
#     back four tables and loose bold lines)
#   · word-report--span-header-fa: a header of two rows — the first column's title over both, two groups each over two
#     columns — on a filled band, the table's double border a point from the page's border of tiles, a filled total row
#     (the first column was lost whole: the table's edge went with the page border)
#   · word-report--nested-rows-fa: rows nested under others — a first-column cell over two rows, each with its unit —
#     under a header of two rows where one title spans two columns; a note of the table's unit above it
#   · word-report--tall-header-fa: a ruled table whose header cells wrap onto two to four centred lines, each centred
#     in the header's height, over body cells of two lines (the header came back a row per line)
#   · word-report--group-header-fa: a header whose last two columns stand under one group title, the others over both
#     rows; a name column whose first and last name stand a tab apart; header titles stretched with kashidas (a column
#     was lost and the header written twice)
#   · word-report--chart-fa: a bar chart drawn of rules and bars with its axis labels, its legend and the values over
#     the bars (one picture: the lab takes pictures out before scoring, so none of its labels is in the expected text)
#   · word-report--frame-head-fa: three pages in a border of tiles (Word's art page border), each under the same three-line centred head with a rule
#     under it and over a page number: the head and the numbers are page furniture
#   · word-lines--heads-fa: numbered bold titles in the body's size, the number a tab before the title (one came back a
#     bold paragraph, one a list item, one a paragraph with its number apart); a bold title that ends
#     in a Latin phrase in brackets after a Latin word; «label: value» lines the first of which fills its measure (the
#     next label was glued to it); a line where a colon follows a Latin phrase
# IMITATED: we cannot run Word here; the files follow what such files hold.
#   python3 scripts/make-tables30-rtl.py    → pdf/producers/word-report--*.pdf, word-lines--heads-fa.pdf and their corpus files
import os, sys
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rtl_pdf
rtl_pdf.CODES |= {ord(c) for c in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ,\'!?@_/%+=|'} | {0x640, 0x2022}
rtl_pdf.FORMS['\u0640'] = [0x640] * 4; rtl_pdf.DUAL.add('\u0640')            # a kashida joins on both sides and is drawn as itself
from rtl_pdf import Font, LAB, REG, BOLD
from rtl_pdf2 import Doc2

WORD = b'Microsoft\xae Word 2019'
def out(name): return os.path.join(LAB, 'pdf', 'producers', name)
def corpus(name, text): open(os.path.join(LAB, 'corpus', name), 'w', encoding='utf8').write(text); print('corpus/' + name)
def doc(): return Doc2({'F1': Font(REG, 'ABCDEE+DemoNazanin'), 'F2': Font(BOLD, 'ABCDEE+DemoNazanin-Bold')})
R, L0, M = 530, 65, 465
BLUE, PALE = '0.66 0.78 0.92 rg', '0.93 0.95 0.98 rg'

def rule(C, page, x0, y0, x1, y1, w=0.6): C.op(page, '%.2f w %.2f %.2f m %.2f %.2f l S' % (w, x0, y0, x1, y1))
def fill(C, page, color, x, y, w, h): C.op(page, '%s %.2f %.2f %.2f %.2f re f 0 g' % (color, x, y, w, h))
def lines_in(C, page, lines, cx, ytop, ybot, size, f, lead=1.5):
    """lines centred on cx and centred between ytop and ybot"""
    n = len(lines); y = (ytop + ybot) / 2 + (n - 1) * size * lead / 2 - size * 0.35
    for l in lines:
        if l: C.line(page, l, y, size, 0, f, center=cx)
        y -= size * lead

def table(C, page, ytop, widths, heights, cells, grid='full', hrows=1, size=9.5, right=R, fills=None, bodyv=True, hlead=1.5):
    """a right-to-left table: widths from the right, heights from the top; cells (r, c, rowspan, colspan, lines, font).
    grid: 'full' rules between all cells (a merged cell ruled around); bodyv False leaves the body's vertical rules out"""
    xs = [right]
    for w in widths: xs.append(xs[-1] - w)
    ys = [ytop]
    for h in heights: ys.append(ys[-1] - h)
    own = {}
    for k, (r, c, rs, cs, _, _) in enumerate(cells):
        for i in range(r, r + rs):
            for j in range(c, c + cs): own[(i, j)] = k
    for r, color in (fills or {}).items(): fill(C, page, color, xs[-1], ys[r + 1], xs[0] - xs[-1], heights[r])
    if grid == 'full':
        for i in range(len(heights) + 1):
            for j in range(len(widths)):
                if i in (0, len(heights)) or own.get((i - 1, j)) != own.get((i, j)): rule(C, page, xs[j + 1], ys[i], xs[j], ys[i])
        for j in range(len(widths) + 1):
            for i in range(len(heights)):
                edge = j in (0, len(widths))
                if edge or (own.get((i, j - 1)) != own.get((i, j)) and (bodyv or i < hrows)): rule(C, page, xs[j], ys[i], xs[j], ys[i + 1])
    if grid == 'word':
        # as Word draws a table's borders: filled rectangles, cut cell by cell; the outer border double — a thick band
        # outside, a thin one inside
        bar = lambda x0, y0, x1, y1: fill(C, page, '0 g', min(x0, x1), min(y0, y1), abs(x1 - x0), abs(y1 - y0))
        for i in range(len(heights) + 1):
            for j in range(len(widths)):
                if i in (0, len(heights)):
                    o = 1 if i == 0 else -1
                    bar(xs[j + 1], ys[i] + o * 1.5, xs[j], ys[i] + o * 4.5); bar(xs[j + 1], ys[i], xs[j], ys[i] + o * 0.75)
                elif own.get((i - 1, j)) != own.get((i, j)): bar(xs[j + 1], ys[i] - 0.25, xs[j], ys[i] + 0.25)
        for j in range(len(widths) + 1):
            for i in range(len(heights)):
                if j in (0, len(widths)):
                    # (thick then thin from the left on both sides, as Word draws a right-to-left table: at the right
                    # edge the thick band lies against the cells and the thin line is the outer one; the row rules
                    # end at the cells' edge, short of the thin line)
                    if j == 0: bar(xs[j], ys[i], xs[j] + 3, ys[i + 1]); bar(xs[j] + 3.7, ys[i], xs[j] + 4.5, ys[i + 1])
                    else: bar(xs[j] - 4.4, ys[i], xs[j] - 1.4, ys[i + 1]); bar(xs[j] - 0.7, ys[i], xs[j], ys[i + 1])
                elif own.get((i, j - 1)) != own.get((i, j)) and (bodyv or i < hrows): bar(xs[j] - 0.25, ys[i], xs[j] + 0.25, ys[i + 1])
    for r, c, rs, cs, lines, f in cells:
        lines_in(C, page, lines, (xs[c] + xs[c + cs]) / 2, ys[r], ys[r + rs], size, f, hlead if r < hrows else 1.5)
    return ys[-1]

def md_table(head, rows):
    esc = lambda c: c.replace('|', '\\|')
    return '\n'.join(['| ' + ' | '.join(esc(c) for c in head) + ' |', '| ' + ' | '.join('---' for _ in head) + ' |'] +
                     ['| ' + ' | '.join(esc(c) for c in r) + ' |' for r in rows])
def mixed(parts):
    """a right-to-left line of runs in typing order, (text, 'r' | 'l'): the runs from the left, a Latin run in its own order"""
    gl = []
    for t, d in reversed(parts): gl += [(ord(c), c) for c in t] if d == 'l' else rtl_pdf.visual(t)
    return gl
def B(c): return '**%s**' % c if c else ''
def J(lines): return ' '.join(l for l in lines if l)

TITLE = 'گزارش سالانه باشگاه کتاب‌خوانی'
RUN = ['باشگاه کتاب‌خوانی محله', 'گزارش سالانه', 'سال 1404']
def framed(C, p, number, head=True):
    """a report's page: Word's art border, the three-line head with a rule under it, the page's number"""
    # Word's art page border: tiles 18 pt long along the four sides, each a thin line, a thick band and three thin lines
    NAVY, bands = '0.05 0.05 0.35 rg', ((24, 24.7), (27.1, 31.7), (35, 35.6), (38.1, 38.8), (41.2, 41.9))
    n = int((C.h - 48) // 18); t = (C.h - 48) / n
    for k in range(n):
        for a, b in bands:
            fill(C, p, NAVY, a, 24 + k * t, b - a, t); fill(C, p, NAVY, C.w - b, 24 + k * t, b - a, t)
    n = int((C.w - 48) // 18); t = (C.w - 48) / n
    for k in range(n):
        for a, b in bands:
            fill(C, p, NAVY, 24 + k * t, a, t, b - a); fill(C, p, NAVY, 24 + k * t, C.h - b, t, b - a)
    if head:
        for k, l in enumerate(RUN): C.line(p, l, 790 - k * 17, 12, 0, 'F2', center=C.w / 2)
        rule(C, p, 190, 748, C.w - 190, 748, 1.2)
    C.line(p, str(number), 54, 10, 0, center=C.w / 2)
def page_top(C, title, lead, frame=None):
    if frame: framed(C, 1, frame, head=False)                             # (one page: a head on it would be its title)
    top = 712 if frame else 775
    C.line(1, title, top, 14, R, 'F2')
    return C.para(1, lead, top - 27, 11, R, M) - 14

# ---- 1. a header ruled column by column over a borderless body ------------------------------------------------------
LEAD1 = ('این گزارش در نشست پایان سال هیئت امنای باشگاه خوانده شد و اعضای هیئت امنا که نامشان در زیر آمده است درستی آن را '
         'با امضای خود گواهی کرده‌اند.')
H1 = ['اعضای هیئت امنا', 'نام نماینده', 'سمت', 'امضا']
B1 = [(['کتابخانه مرکزی شهر'], ['-'], ['-']),
      (['انجمن اولیا و مربیان', 'دبستان‌های محله'], ['نسرین کتابدار'], ['رئیس هیئت امنا -', 'غیر موظف']),
      (['انجمن نویسندگان', 'و تصویرگران شهر'], ['بهرام آموزگار'], ['دبیر باشگاه و عضو هیئت امنا', '- موظف']),
      (['شورای محله'], ['پروین باغبان'], ['عضو هیئت امنا -', 'غیر موظف']),
      (['فروشگاه کتاب امید'], ['فرهاد کتابفروش'], ['خزانه‌دار -', 'غیر موظف'])]
END1 = 'نسخه امضاشده این گزارش در دفتر کتابخانه نگهداری می‌شود.'
C = doc(); y = page_top(C, TITLE, LEAD1)
W1 = [130, 110, 135, 90]; xs = [R]
for w in W1: xs.append(xs[-1] - w)
for j, h in enumerate(H1):
    C.line(1, h, y, 9.5, 0, 'F2', center=(xs[j] + xs[j + 1]) / 2)
    rule(C, 1, xs[j + 1] + 8, y - 7, xs[j] - 8, y - 7, 0.9)
y -= 12
for row in B1:
    for j, ls in enumerate(row): lines_in(C, 1, ls, (xs[j] + xs[j + 1]) / 2, y, y - 46, 9.5, 'F1')
    y -= 46
C.para(1, END1, y - 16, 11, R, M)
C.write(out('word-report--ruled-header-fa.pdf'), WORD, 'ruled-header-fa')
corpus('ruled-header-fa.md', '# %s\n\n%s\n\n%s\n\n%s\n' % (TITLE, LEAD1, md_table(H1, [[J(a), J(b), J(c), ''] for a, b, c in B1]), END1))

# ---- 2. a header of two rows, the first column's title over both ----------------------------------------------------
HEAD2 = '2- کتاب‌های امانت‌گرفته'
LEAD2 = 'جدول زیر شمار کتاب‌هایی را که هر گروه از اعضا در دو سال گذشته به امانت گرفته‌اند و سهم هر گروه را نشان می‌دهد.'
G2 = ['سال 1404', 'سال 1403']; S2 = ['شمار کتاب', 'درصد']
R2 = [('دانش‌آموزان دبستان', '1,180', '34.0', '960', '32.0'), ('دانش‌آموزان دبیرستان', '815', '23.5', '720', '24.0'),
      ('دانشجویان', '590', '17.0', '540', '18.0'), ('آموزگاران', '430', '12.4', '390', '13.0'),
      ('بازنشستگان', '205', '5.9', '-', '-'), ('دیگر اعضا', '250', '7.2', '390', '13.0')]
TOT2 = ('جمع', '3,470', '100', '3,000', '100')
END2 = 'بیشترین رشد در گروه دانش‌آموزان دبستان بوده است.'
C = doc(); y = page_top(C, HEAD2, LEAD2, frame=18)
cells = [(0, 0, 2, 1, ['نام گروه'], 'F2'), (0, 1, 1, 2, [G2[0]], 'F2'), (0, 3, 1, 2, [G2[1]], 'F2')]
cells += [(1, 1 + j, 1, 1, [S2[j % 2]], 'F2') for j in range(4)]
for i, row in enumerate(R2 + [TOT2]):
    cells += [(2 + i, j, 1, 1, [v], 'F2' if row is TOT2 else 'F1') for j, v in enumerate(row)]
n = len(R2) + 3
y = table(C, 1, y, [200, 92, 57, 78, 48], [24, 24] + [39] * (n - 2), cells, grid='word', hrows=2, right=C.w - 47.3, fills={0: BLUE, 1: BLUE, n - 1: BLUE})
C.para(1, END2, y - 22, 11, R, M)
C.write(out('word-report--span-header-fa.pdf'), WORD, 'span-header-fa')
corpus('span-header-fa.md', '# %s\n\n%s\n\n%s\n\n%s\n' % (HEAD2, LEAD2, md_table(['نام گروه', G2[0], '', G2[1], ''],
       [[B('نام گروه')] + [B(S2[j % 2]) for j in range(4)]] + [list(r) for r in R2] + [[B(v) for v in TOT2]]), END2))

# ---- 3. rows nested under others ------------------------------------------------------------------------------------
HEAD3 = '3- خریدهای باشگاه'
LEAD3 = 'خریدهای باشگاه در دو سال گذشته به تفکیک نوع و واحد شمارش در جدول زیر آمده است.'
NOTE3 = '(مبلغ‌ها به هزار تومان)'
G3 = ['سال 1404', 'سال 1403']
R3 = [(['کتاب کودک', 'و نوجوان'], [('جلد', '720', '5,400', '610', '4,270'), ('بسته', '45', '1,350', '38', '1,064')]),
      (['کاغذ و', 'نوشت‌افزار'], [('بسته', '160', '480', '185', '518'), ('عدد', '1,900', '190', '1,450', '116')]),
      (['قفسه', 'و میز'], [('عدد', '14', '2,100', '9', '1,260'), ('دست', '3', '1,800', '2', '1,100')])]
TOT3 = ('جمع', '-', '-', '11,320', '-', '-', '8,328')
END3 = 'بیشترین هزینه سال برای خرید کتاب کودک و نوجوان بوده است.'
C = doc(); y = page_top(C, HEAD3, LEAD3)
C.line(1, NOTE3, y, 8.5, L0 + C.width(rtl_pdf.visual(NOTE3), 8.5, 'F1')); y -= 8
cells = [(0, 0, 2, 1, ['شرح'], 'F2'), (0, 1, 1, 3, [G3[0]], 'F2'), (0, 4, 1, 3, [G3[1]], 'F2')]
for g in (0, 1): cells += [(1, 1 + 3 * g, 1, 2, ['مقدار'], 'F2'), (1, 3 + 3 * g, 1, 1, ['مبلغ'], 'F2')]
r = 2
for label, subs in R3:
    cells.append((r, 0, 2, 1, label, 'F1'))
    for k, (unit, q1, a1, q2, a2) in enumerate(subs):
        cells += [(r + k, 1 + j, 1, 1, [v], 'F1') for j, v in enumerate((unit, q1, a1, unit, q2, a2))]
    r += 2
cells += [(r, j, 1, 1, [v], 'F2') for j, v in enumerate(TOT3)]
y = table(C, 1, y, [95, 45, 65, 75, 45, 65, 75], [19, 19] + [21] * 6 + [21], cells, hrows=2, fills={0: BLUE, 1: BLUE, 8: BLUE})
C.para(1, END3, y - 22, 11, R, M)
C.write(out('word-report--nested-rows-fa.pdf'), WORD, 'nested-rows-fa')
rows3 = [[B('شرح'), B('مقدار'), '', B('مبلغ'), B('مقدار'), '', B('مبلغ')]]
for label, subs in R3: rows3 += [[J(label), u, q1, a1, u, q2, a2] for u, q1, a1, q2, a2 in subs]
corpus('nested-rows-fa.md', '# %s\n\n%s\n\n%s\n\n%s\n\n%s\n' % (HEAD3, LEAD3, NOTE3, md_table(['شرح', G3[0], '', '', G3[1], '', ''],
       rows3 + [[B(v) for v in TOT3]]), END3))

# ---- 4. header cells of two to four lines over body cells of two ----------------------------------------------------
HEAD4 = '4- کارگروه نشست‌ها'
LEAD4 = 'اعضای کارگروه نشست‌های باشگاه در سال گذشته عبارت بودند از:'
H4 = [['نام و', 'نام خانوادگی'], ['سمت'], ['پیشه و', 'جای کار امروز'], ['تاریخ', 'پیوستن', 'به', 'کارگروه', 'نشست‌های', 'باشگاه'],
      ['همکاری', 'هم‌زمان', 'با', 'کارگروه', 'در', 'باشگاه‌های دیگر'], ['پیشینه', 'کار در کتابخانه‌ها']]
R4 = [(['نسرین', 'کتابدار'], ['رئیس', 'کارگروه'], ['کتابدار', 'کتابخانه مرکزی'], ['1402/07/10'], ['-'], ['کتابداری و برگزاری', 'نشست در کتابخانه‌ها']),
      (['بهرام', 'آموزگار'], ['عضو', 'کارگروه'], ['آموزگار', 'دبستان'], ['1402/07/10'], ['-'], ['آموزش و برگزاری', 'کارگاه در دبستان‌ها']),
      (['پروین', 'باغبان'], ['عضو', 'کارگروه'], ['نویسنده'], ['1403/09/21'], ['باشگاه کتاب', 'محله بالا'], ['نویسندگی و ویرایش', 'کتاب کودک']),
      (['فرهاد', 'کتابفروش'], ['عضو', 'کارگروه'], ['کتابفروش'], ['1402/07/10'], ['-'], ['فروش و پخش', 'کتاب در شهر'])]
END4 = 'کارگروه در سال گذشته دوازده نشست برگزار کرد.'
C = doc(); y = page_top(C, HEAD4, LEAD4)
cells = [(0, j, 1, 1, ls, 'F2') for j, ls in enumerate(H4)]
for i, row in enumerate(R4): cells += [(1 + i, j, 1, 1, ls, 'F1') for j, ls in enumerate(row)]
y = table(C, 1, y, [62, 52, 82, 70, 92, 107], [118] + [36] * len(R4), cells, fills={0: BLUE}, size=9, hlead=1.9)
C.para(1, END4, y - 22, 11, R, M)
C.write(out('word-report--tall-header-fa.pdf'), WORD, 'tall-header-fa')
corpus('tall-header-fa.md', '# %s\n\n%s\n\n%s\n\n%s\n' % (HEAD4, LEAD4, md_table([J(h) for h in H4], [[J(c) for c in r] for r in R4]), END4))

# ---- 5. a group title over the last two columns, names a tab apart, kashidas in the header --------------------------
HEAD5 = '5- همکاران باشگاه'
LEAD5 = 'همکاران باشگاه و زمینه کار و آموزش آنان در جدول زیر آمده است.'
H5 = ['ردیف', 'نام و نام خانوادگی', 'زمینه همکاری', 'پیشینه همکاری (سال)']
R5 = [('نسرین', 'کتابدار', 'سرپرست سالن مطالعه', '12', 'کارشناسی ارشد', 'کتابداری'), ('بهرام', 'آموزگار', 'سرپرست کارگاه نویسندگی', '9', 'کارشناسی', 'آموزش ابتدایی'),
      ('پروین', 'باغبان', 'سرپرست نشست نقد کتاب', '7', 'کارشناسی', 'ادبیات فارسی'), ('فرهاد', 'کتابفروش', 'سرپرست خرید کتاب', '3', 'دکترا', 'مدیریت'),
      ('شیرین', 'نقاش', 'سرپرست بخش کودک', '5', 'کارشناسی', 'تصویرگری'), ('امید', 'رایانه‌کار', 'سرپرست وب‌سایت', '2', 'کارشناسی ارشد', 'نرم‌افزار')]
END5 = 'همه همکاران باشگاه داوطلبانه کار می‌کنند.'
C = doc(); y = page_top(C, HEAD5, LEAD5)
W5 = [32, 96, 112, 76, 71, 78]; xs = [R]
for w in W5: xs.append(xs[-1] - w)
cells = [(0, j, 2, 1, [h] if j < 3 else ['پیشینه همکاری', '(سال)'], 'F2') for j, h in enumerate(H5)]
cells += [(0, 4, 1, 2, ['آمـوزش'], 'F2'), (1, 4, 1, 1, ['مـدرک'], 'F2'), (1, 5, 1, 1, ['رشتـه تحصیلـی'], 'F2')]
for i, (fn, ln, job, yrs, deg, fld) in enumerate(R5):
    cells += [(2 + i, 0, 1, 1, [str(i + 1)], 'F1'), (2 + i, 1, 1, 1, [], 'F1'), (2 + i, 2, 1, 1, [job], 'F1'), (2 + i, 3, 1, 1, [yrs], 'F1'),
              (2 + i, 4, 1, 1, [deg], 'F1'), (2 + i, 5, 1, 1, [fld], 'F1')]
yb = table(C, 1, y, W5, [17, 17] + [22] * len(R5), cells, hrows=2, fills={0: BLUE, 1: BLUE}, size=9)
for i, (fn, ln, *_ ) in enumerate(R5):                                     # the first name at the right, the last name a tab on
    yy = y - 34 - 22 * i - 11 - 9 * 0.35
    C.line(1, fn, yy, 9, xs[1] - 6); C.line(1, ln, yy, 9, xs[1] - 46)
C.para(1, END5, yb - 22, 11, R, M)
C.write(out('word-report--group-header-fa.pdf'), WORD, 'group-header-fa')
corpus('group-header-fa.md', '# %s\n\n%s\n\n%s\n\n%s\n' % (HEAD5, LEAD5, md_table(H5 + ['آموزش', ''],
       [[B(h) for h in H5] + [B('مدرک'), B('رشته تحصیلی')]] + [[str(i + 1), fn + ' ' + ln, job, yrs, deg, fld] for i, (fn, ln, job, yrs, deg, fld) in enumerate(R5)]), END5))

# ---- 6. a bar chart drawn of rules and bars -------------------------------------------------------------------------
HEAD6 = '6- نشست‌های هر فصل'
LEAD6 = 'شمار نشست‌های باشگاه در چهار فصل دو سال گذشته در نمودار زیر آمده است.'
CAP6 = 'نمودار 1: شمار نشست‌های هر فصل'
END6 = 'بیشترین شمار نشست‌ها در پاییز و زمستان بوده است، چون مدرسه‌ها باز هستند.'
C = doc(); y = page_top(C, HEAD6, LEAD6)
C.line(1, CAP6, y, 9.5, 0, 'F2', center=C.w / 2); y -= 14
x0, base, top = 150, y - 150, y - 10
for k in range(5):
    yy = base + k * 35; rule(C, 1, x0, yy, x0 + 300, yy, 0.3); C.line(1, str(k * 5), yy - 3, 8, x0 - 6)
for q, (name, a, b) in enumerate([('بهار', 9, 11), ('تابستان', 6, 8), ('پاییز', 14, 15), ('زمستان', 13, 16)][::-1]):
    cx = x0 + 40 + q * 72
    for d, v, col in ((-13, b, '0.12 0.16 0.27 rg'), (13, a, '0.77 0.54 0.07 rg')):
        fill(C, 1, col, cx + d - 11, base, 22, v * 7); C.line(1, str(v), base + v * 7 + 3, 8, 0, center=cx + d)
    C.line(1, name, base - 13, 9, 0, center=cx)
fill(C, 1, '0.12 0.16 0.27 rg', 250, base - 38, 8, 8); C.line(1, '1404', base - 37, 8.5, 246)
fill(C, 1, '0.77 0.54 0.07 rg', 340, base - 38, 8, 8); C.line(1, '1403', base - 37, 8.5, 336)
C.para(1, END6, base - 66, 11, R, M)
C.write(out('word-report--chart-fa.pdf'), WORD, 'chart-fa')
corpus('chart-fa.md', '# %s\n\n%s\n\n**%s**\n\n%s\n' % (HEAD6, LEAD6, CAP6, END6))

# ---- 7. three framed pages under one running head -------------------------------------------------------------------
SEC = [('1- نشست‌ها', ['باشگاه کتاب‌خوانی محله در سال گذشته هر هفته یک نشست برگزار کرد و شمار اعضای آن از چهل نفر به بیش از صد و بیست نفر رسید. بیشتر اعضا دانش‌آموزان و دانشجویان هستند و نشست‌ها در سالن کوچک کتابخانه برگزار می‌شود.',
                        'در هر نشست یک کتاب معرفی می‌شود و اعضا درباره آن گفت‌وگو می‌کنند. فهرست کتاب‌های هر فصل را خود اعضا با رای‌گیری انتخاب می‌کنند و کتابخانه نسخه‌های کافی از هر کتاب را فراهم می‌کند.']),
       ('2- کارگاه‌ها', ['کارگاه‌های پاییز باشگاه در سه هفته پیاپی برگزار شد و شرکت در آن‌ها برای همه اعضا رایگان بود. هر کارگاه دو ساعت بود و در سالن کوچک کتابخانه برگزار شد.',
                         'کارگاه نویسندگی بیشترین شرکت‌کننده را داشت و قرار است سال آینده در دو گروه برگزار شود تا همه خواستاران بتوانند در آن شرکت کنند.']),
       ('3- برنامه سال آینده', ['برنامه سال آینده شامل دو کارگاه نویسندگی، یک جشن پایان فصل و بازدید از چاپخانه شهر است. هزینه این برنامه‌ها از کمک‌های مردمی و حق عضویت اعضا فراهم می‌شود.',
                                'اعضای تازه می‌توانند در نخستین نشست هر ماه نام‌نویسی کنند. برای نام‌نویسی تنها کارت کتابخانه لازم است و شرکت در نشست‌ها برای همه رایگان است.'])]
C = doc()
for p, (head, paras) in enumerate(SEC, 1):
    framed(C, p, p)
    C.line(p, head, 712, 13, R, 'F2'); y = 686
    for t in paras: y = C.para(p, t, y, 11, R, M) - 10
C.write(out('word-report--frame-head-fa.pdf'), WORD, 'frame-head-fa')
corpus('frame-head-fa.md', '\n\n'.join('# %s\n\n%s' % (h, '\n\n'.join(ps)) for h, ps in SEC) + '\n')

# ---- 8. numbered bold titles, a Latin phrase in brackets, «label: value» lines --------------------------------------
T8 = 'کارگاه‌های پاییز باشگاه کتاب‌خوانی'
S8 = ['1. معرفی کارگاه‌ها', '2. برنامه کارگاه‌ها', '3. نام‌نویسی']
P8 = 'هم‌زمان با هفته کتاب، سه کارگاه در کتابخانه مرکزی شهر برگزار می‌شود. کارگاه‌ها برای همه اعضا آزاد است.'
W8a = 'کارگاه نخست – Book Club: از خواندن تا گفت‌وگو'
W8b = 'کارگاه دوم: نوشتن برای وب Web (Web Writing)'
V8a = [('مدرس', 'نسرین کتابدار، کتابدار کتابخانه مرکزی شهر و سرپرست سالن مطالعه و بخش امانت کتاب'), ('زمان', 'شنبه 8 آبان، ساعت 10 تا 12')]
V8b = [('مدرس', 'بهرام آموزگار، آموزگار دبستان و سرپرست کارگاه نویسندگی باشگاه کتاب‌خوانی محله ما'), ('زمان', 'یکشنبه 9 آبان، ساعت 10 تا 12')]
I8 = ['آشنایی با شیوه‌های گفت‌وگو درباره کتاب', 'گرداندن یک نشست کتاب‌خوانی']
E8 = [('مهلت نام‌نویسی', '5 آبان'), ('شیوه برگزاری', 'حضوری')]
C = doc()
C.line(1, T8, 775, 14, 0, 'F2', center=C.w / 2); y = 745
def numbered(text, y):
    # Word's numbered paragraph: the number, a tab, the title — in the body's size, bold; the first two with the
    # number bold, the third with a regular number (the list's own run)
    num, title = text.split(' ', 1)
    C.line(1, num, y, 11, R - 18, 'F2' if num != '3.' else 'F1'); C.line(1, title, y, 11, R - 36, 'F2'); return y - 20
y = numbered(S8[0], y); y = C.para(1, P8, y, 11, R, M) - 6
y = numbered(S8[1], y)
C.line(1, None, y, 11, R, 'F2', gl=mixed([('کارگاه نخست –', 'r'), (' ', 'l'), ('Book Club', 'l'), (':', 'l'), (' ', 'l'), ('از خواندن تا گفت‌وگو', 'r')])); y -= 18
ls = C.wrap('%s: %s' % V8a[0], 11, 'F1', M)                                    # two lines: the second stops short
for k, l in enumerate(ls): C.line(1, l, y, 11, R, justify=M if k < len(ls) - 1 else None); y -= 17.6
C.line(1, '%s: %s' % V8a[1], y, 11, R); y -= 17.6
C.line(1, 'سرفصل‌ها:', y, 11, R); y -= 17.6
for it in I8: C.line(1, '• ' + it, y, 11, R - 18); y -= 17.6
y -= 6
C.line(1, None, y, 11, R, 'F2', gl=mixed([('کارگاه دوم: نوشتن برای وب', 'r'), (' ', 'l'), ('Web (Web Writing)', 'l')])); y -= 18
full = '%s: %s' % V8b[0]; assert len(C.wrap(full, 11, 'F1', M)) == 1 and C.width(rtl_pdf.visual(full), 11, 'F1') > M - 30, C.width(rtl_pdf.visual(full), 11, 'F1')
C.line(1, full, y, 11, R, justify=M); y -= 17.6                                # one line that fills its measure
C.line(1, '%s: %s' % V8b[1], y, 11, R); y -= 17.6
C.line(1, 'سرفصل‌ها:', y, 11, R); y -= 17.6
for it in I8[::-1]: C.line(1, '• ' + it, y, 11, R - 18); y -= 17.6
y -= 6
y = numbered(S8[2], y)
for l, v in E8: C.line(1, '%s: %s' % (l, v), y, 11, R); y -= 17.6
C.write(out('word-lines--heads-fa.pdf'), WORD, 'heads-fa')
corpus('heads-fa.md', '# %s\n\n## %s\n\n%s\n\n## %s\n\n**%s**\n\n%s\\\n%s\\\nسرفصل‌ها:\n\n%s\n\n**%s**\n\n%s\\\n%s\\\nسرفصل‌ها:\n\n%s\n\n## %s\n\n%s\n' % (
    T8, S8[0], P8, S8[1], W8a, '%s: %s' % V8a[0], '%s: %s' % V8a[1], '\n'.join('- ' + i for i in I8),
    W8b, '%s: %s' % V8b[0], '%s: %s' % V8b[1], '\n'.join('- ' + i for i in I8[::-1]),
    S8[2], '\\\n'.join('%s: %s' % e for e in E8)))
