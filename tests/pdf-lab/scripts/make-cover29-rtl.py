# A Word cover page whose title lines are in a font Kelk does not know (rtl_pdf2.py; DejaVu Sans subsets; text of our
# own), for Kelk 2.9's blank glyphs and its small unreadable fonts. From a real file's habits:
#   · word-cover--glyph-index-fa: a cover page — centred lines, a large title — then a page of body text. The first
#     line and the year are in a bold font whose ToUnicode names each glyph by a glyph index (the code points of a
#     legacy font's ~500 glyphs: Latin Extended letters, the space U+0003) and whose codes run from 33 in order of
#     first use; the blank lines between the cover's lines are spaces in that font, drawn twice (a bold Word draws
#     by printing a font twice). The other lines are in fonts named right.
#   Kelk 2.9 reads the blank lines as blank (the space named U+0003 came out «�», a line of them per blank line) and
#   reports the small font unreadable (garbledText: too little text for the judge alone, its letters accented Latin
#   in a Persian document); its two lines stay unread until Kelk reads fonts it does not know (TODO.md, 3.0).
# IMITATED: we cannot run Word here; the file follows what such files hold.
#   python3 scripts/make-cover29-rtl.py   → pdf/producers/word-cover--glyph-index-fa.pdf and corpus/glyph-index-fa.md
import os, sys
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rtl_pdf
rtl_pdf.CODES |= set(range(0x6F0, 0x6FA))
from rtl_pdf import Font, LAB, REG, BOLD
from rtl_pdf2 import Doc2, Renum

WORD = b'Microsoft\xae Word 2010'
def out(name): return os.path.join(LAB, 'pdf', 'producers', name)
def corpus(name, text): open(os.path.join(LAB, 'corpus', name), 'w', encoding='utf8').write(text); print('corpus/' + name)
R, M = 530, 465

# the unknown font's names: each glyph by its rank in the order its code is written, from U+0152 (Latin Extended-A); its
# digits by their value from U+00D9; the space U+0003 (the space is glyph 3 of a TrueType font)
TF = Font(BOLD, 'AAEWHA+DemoTitr,Bold')
rank = {}
def gname(g):
    if g == TF.gid(0x20): return '\x03'
    for v in range(10):
        if g == TF.gid(0x6F0 + v): return chr(0xD9 + v)
    rank.setdefault(g, len(rank))
    return chr(0x152 + rank[g])
T = Renum(TF, names=gname)
C = Doc2({'T': T, 'F1': Font(REG, 'AAEWHB+DemoNazanin'), 'F2': Font(BOLD, 'AAEWHC+DemoNazanin,Bold')})

TOP = 'به نام خدا'
LINES = [('انجمن کتاب‌خوانی محله', 16), ('دفتر برنامه‌ریزی', 14), ('کارگروه نشست‌ها', 12)]
TITLE = 'برنامه سالانه باشگاه کتاب‌خوانی'
YEAR = '۱۴۰۴'
BODY = ['باشگاه کتاب‌خوانی محله در سال گذشته هر هفته یک نشست برگزار کرد و شمار اعضای آن از چهل نفر به بیش از صد و '
        'بیست نفر رسید. بیشتر اعضا دانش‌آموزان و دانشجویان هستند و نشست‌ها در سالن کوچک کتابخانه برگزار می‌شود.',
        'در هر نشست یک کتاب معرفی می‌شود و اعضا درباره آن گفت‌وگو می‌کنند. فهرست کتاب‌های هر فصل را خود اعضا با رای‌گیری '
        'انتخاب می‌کنند و کتابخانه نسخه‌های کافی از هر کتاب را فراهم می‌کند.',
        'برنامه سال آینده شامل دو کارگاه نویسندگی، یک جشن پایان فصل و بازدید از چاپخانه شهر است. هزینه این برنامه‌ها از '
        'کمک‌های مردمی و حق عضویت اعضا فراهم می‌شود.']

cx = C.w / 2
def twice(y, size, text=None, f='T'):
    """a line in a bold font drawn twice, a hair apart (no text: a blank line of spaces)"""
    for dx in (0, 0.4):
        if text: C.line(1, text, y, size, 0, f, center=cx + dx)
        else: C.line(1, '   ', y, size, 0, f, center=cx + dx)
C.line(1, TOP, 760, 11, 0, 'T', center=cx)
twice(735, 11)
y = 700
for t, size in LINES:
    C.line(1, t, y, size, 0, 'F2', center=cx); y -= size * 2
twice(y, 11); y -= 50
C.line(1, TITLE, y, 22, 0, 'F2', center=cx); y -= 60
twice(y, 11); y -= 60
C.line(1, YEAR, y, 24, 0, 'T', center=cx)
y = 760
for t in BODY: y = C.para(2, t, y, 11, R, M) - 12
C.write(out('word-cover--glyph-index-fa.pdf'), WORD, 'glyph-index-fa')
corpus('glyph-index-fa.md', '%s\n\n%s\n\n# %s\n\n%s\n\n%s\n' % (TOP, '\n\n'.join(t for t, _ in LINES), TITLE, YEAR, '\n\n'.join(BODY)))
