# A three-page Persian report as Word prints it — built by hand, glyph by glyph, each habit on purpose, with our own text:
#   · a cover: a coloured band across the page with the title, the subtitle and, last, a line «تهیه کننده: …» in white,
#     bold, a size over the body (read as a `###` heading: a section with nothing in it)
#   · footnotes: a mark set small and raised after a word («¹», «²»), the notes at the page's foot under a short rule at
#     the start side, set smaller, each opened by its mark; the page's last paragraph runs on to the next page past the
#     notes (the notes came back as paragraphs between its two halves, and the halves were never joined)
#   · the second footnote's mark drawn as a small picture before its line, no text of its own (Word may draw a note's
#     mark so: the note came back without it)
#   · endnotes after the text's end on the last page: raised small roman marks in the text («i», «ii»), then a short
#     rule and the notes, smaller, each opened by its raised mark
#   · words in brackets in a right-to-left line, the ToUnicode naming each bracket by its logical character; the same
#     file again with its dictionaries in object streams (`word365-report`), as Word for Microsoft 365 writes it
#   · a signature at the far (left) side, the name bold and a size up over its title (read as a heading)
# The Markdown that must come back is corpus/report-fa.md.
#   python3 scripts/make-report-rtl.py      → pdf/producers/word-report--report-fa.pdf, corpus/report-fa.md
import os, sys
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rtl_pdf
rtl_pdf.CODES |= {0xB9, 0xB2, 0xB3, ord('i')}
from rtl_pdf import Font, Doc, LAB, REG, BOLD
# (an opening bracket before a Persian word, as Word draws it: at the word's right, the ")" shape, named "(" — the
# logical character; rtl_pdf's visual() handles a closing one at a word's end, so the opening one is put in here)
_visual0 = rtl_pdf.visual
def visual(text):
    out = []
    for k, tok in enumerate(text.split(' ')):
        if k: out = [(0x20, ' ')] + out
        if tok.startswith('(') and len(tok) > 1 and rtl_pdf.is_ar(tok):
            out = _visual0(tok[1:]) + [(ord(')'), '(')] + out
        else:
            out = _visual0(tok) + out
    return out
rtl_pdf.visual = visual

C = Doc({'F1': Font(REG, 'AAAAAA+DemoNazanin'), 'F2': Font(BOLD, 'AAAAAB+DemoNazanin-Bold')})
R, L0 = 530, 65                                   # the text column
W, H = C.w, C.h

def centred(page, text, y, size, f):
    gl = visual(text); C.put(page, gl, (L0 + R) / 2 - C.width(gl, size, f) / 2, y, size, f)
def wrap(text, size, f, measure):
    lines, cur = [], ''
    for w in text.split(' '):
        t = (cur + ' ' + w).strip()
        if cur and C.width(visual(t), size, f) > measure: lines.append(cur); cur = w
        else: cur = t
    return lines + [cur]
def para(page, text, y, size=12, f='F1', pitch=20, last_full=False, marks=()):
    """a justified paragraph; marks: words after which a footnote mark is set (small, raised)"""
    ls = wrap(text, size, f, R - L0 - 10)
    for k, t in enumerate(ls):
        full = k < len(ls) - 1 or last_full
        x0 = C.line(page, t, y - pitch * k, size, R, f, justify=(R - L0) if full else None)
        for word, mark in marks:
            if word in t.split(' '):
                # the mark at the word's left end (the word's start is at its right): measured from the line's right edge
                before = t[:t.index(word) + len(word)]
                gl = visual(t); n = sum(1 for c, _ in gl if c == 0x20)
                extra = ((R - L0) - C.width(gl, size, f)) / n if full and n else 0
                wb = C.width(visual(before), size, f) + extra * before.count(' ')
                mg = [(ord(c), c) for c in mark]
                C.put(page, mg, R - wb - C.width(mg, 7, f) - 0.3, y - pitch * k + 4.5, 7, f)
    return y - pitch * len(ls)

# ── page 1: the cover ──
C.op(1, '0.86 0.42 0.12 rg 0 470 %.2f 190 re f' % W)
C.op(1, '1 g')
centred(1, 'گزارش طرح نمونه سازی داده های شهری', 600, 22, 'F2')
centred(1, 'بررسی منابع داده و پیشنهاد گام های بعدی', 560, 14, 'F1')
centred(1, 'تهیه کننده: واحد برنامه ریزی نمونه', 500, 14, 'F2')
C.op(1, '0 g')
centred(1, 'پاییز 1405', 300, 12, 'F1')

# ── page 2: the text, two notes at its foot ──
C.line(2, 'مقدمه', 760, 15, R, 'F2')
y = para(2, 'این گزارش نتیجه شش ماه کار گروه داده در واحد نمونه است و هدف آن شناخت منابع داده موجود و پیشنهاد گام های بعدی برای'
            ' استفاده بهتر از آنهاست. در این مدت بیست و دو منبع (جدول و سامانه) بررسی شد و برای هر یک شیوه نگهداری آن ثبت شد.',
         730, marks=[('شد.', '¹')])
y = para(2, 'بیشتر منابع در قالب جدول نگهداری می شوند و تنها چند منبع از سامانه های بیرونی به دست می آیند. کیفیت داده ها در منابع'
            ' مختلف یکسان نیست و در برخی از آنها مقدار خالی زیاد دیده می شود که پیش از هر تحلیلی باید برطرف شود.', y - 10,
         marks=[('شود.', '²')])
y = para(2, 'در بخش های بعد هر منبع با جزئیات بیشتری معرفی می شود و برای هر کدام پیشنهادی برای بهبود ارائه می شود که با توجه'
            ' به امکانات واحد قابل اجراست و هزینه زیادی ندارد و در جلسه آینده گروه برای تصمیم گیری مطرح خواهد شد و پس از آن'
            ' بررسی و تایید مدیران', y - 10,
         last_full=True)
# the notes: a short rule at the start side, then each note smaller, opened by its mark
C.op(2, '0 G 0.5 w %.2f 118 m %.2f 118 l S' % (R - 150, R))
C.line(2, '¹ این فهرست در پیوست گزارش آمده است.', 104, 9, R, 'F1')
# (the second note's mark drawn as a small picture at the line's start, no text of its own — as Word may draw it)
x2 = C.line(2, 'شیوه برطرف کردن آنها در بخش سوم آمده است.', 90, 9, R - 9, 'F1')
C.images.append((2, R - 5, 91, 4.5, 7))
C.line(2, '2', 50, 10, (L0 + R) / 2 + 3, 'F1')

# ── page 3: the paragraph goes on; a signature ──
y = para(3, 'واحد و هماهنگی با گروه های کاری نتیجه آن به همه همکاران اطلاع داده می شود تا در برنامه سال آینده در نظر گرفته شود.', 770)
C.line(3, 'نتیجه گیری', y - 20, 15, R, 'F2')
y = para(3, 'منابع داده واحد نمونه با چند گام ساده قابل استفاده تر می شوند و پیشنهاد می شود این کار از منابع پرکاربرد آغاز شود.', y - 50,
         marks=[('ساده', 'i')])
y = para(3, 'گزارش کامل هر منبع در اختیار گروه داده است و برای دیدن آن می توان با دبیرخانه گروه تماس گرفت.', y - 10, marks=[('دبیرخانه', 'ii')])
y = para(3, 'نسخه بعدی این گزارش در پایان سال منتشر خواهد شد.', y - 10, marks=[('سال', '³')])
# the signature at the far (left) side: the name bold and a size up, its title under it
sx = L0 + 120
C.line(3, 'مریم نمونه', y - 50, 14, sx, 'F2')
C.line(3, 'مدیر واحد برنامه ریزی', y - 72, 12, sx, 'F2')
# endnotes after the text's end: a short rule at the start side, each note smaller, opened by its raised roman mark
ey = y - 120
C.op(3, '0 G 0.5 w %.2f %.2f m %.2f %.2f l S' % (R - 150, ey, R, ey))
for k, (mk, t) in enumerate([('i', 'گام ها در پیوست دوم گزارش شرح داده شده اند.'), ('ii', 'نشانی دبیرخانه در صفحه پایانی آمده است.')]):
    yy = ey - 14 - 14 * k
    mg = [(ord(c), c) for c in mk]
    C.put(3, mg, R - C.width(mg, 6, 'F1'), yy + 3.5, 6, 'F1')
    C.line(3, t, yy, 9, R - C.width(mg, 6, 'F1') - 2, 'F1')
# a footnote on this page too, its mark a picture at the same place as page 2's second one (one place on two pages:
# taken for a logo repeated in the margin, and dropped)
C.op(3, '0 G 0.5 w %.2f 118 m %.2f 118 l S' % (R - 150, R))
C.line(3, 'تاریخ دقیق انتشار بعدا اعلام می شود.', 90, 9, R - 9, 'F1')
C.images.append((3, R - 5, 91, 4.5, 7))
C.line(3, '3', 50, 10, (L0 + R) / 2 + 3, 'F1')
C.write(os.path.join(LAB, 'pdf', 'producers', 'word-report--report-fa.pdf'), b'Microsoft\xae Word 2019', 'report-fa')
# the same file as Word for Microsoft 365 writes it: its dictionaries packed into object streams (the font descriptors
# among them — the importer found no font program, and every repair that reads one was skipped: brackets, ZWNJs)
import subprocess
src = os.path.join(LAB, 'pdf', 'producers', 'word-report--report-fa.pdf')
subprocess.run(['qpdf', '--object-streams=generate', src, os.path.join(LAB, 'pdf', 'producers', 'word365-report--report-fa.pdf')], check=True)
print('pdf/producers/word365-report--report-fa.pdf (object streams)')
