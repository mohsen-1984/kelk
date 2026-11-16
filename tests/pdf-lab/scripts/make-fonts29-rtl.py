# Kelk 2.9's font cases in the B fonts (B Nazanin, B Nazanin Bold, B Nazanin Outline, B Mitra, B Mitra Bold, B Titr Bold;
# (c) Borna Rayaneh, see lib/pdf-base64-ttf-fonts/borna-rayaneh/NOTICE.txt), as Word and a print driver write them. Each
# file embeds subsets of the fonts, as any PDF made with them does. Text of our own.
#   · word-bfonts--faces-fa: the six faces with a right ToUnicode — the control: nothing here may be reported garbled;
#   · word-bfonts--tounicode-fa: B Mitra Bold with a ToUnicode wrong for about half its joining forms (a form named by a
#     space, by another letter, or by its glyph index + 1 as a control or Latin-1 code; the tatweel named «ک»; the
#     guillemets swapped), and B Mitra with a few forms wrong — the font's own cmap right throughout;
#   · word-bfonts--parens-fa: B Nazanin with the mirrored bracket glyphs named «م» and a space and the comma glyph named
#     «.» (amounts read «4.518.260»), B Nazanin Bold right; a line justified by tatweels, the tatweel named «ر»;
#   · driver-print--renumbered-fa: B Titr Bold and B Nazanin Bold as a print driver's simple fonts — codes numbered in
#     order of first use, no ToUnicode, no glyph names, a (1,0) cmap only — and a line in white Helvetica above the page.
# IMITATED: we cannot run Word or a print driver here. The wrong ToUnicode tables are written by this script (our own
# tables, after the kinds of error Word's files show), not produced by Word; the renumbered fonts are built by
# rtl_pdf2.Renum, not by a driver.
#   python3 scripts/make-fonts29-rtl.py   → pdf/producers/word-bfonts--*.pdf, driver-print--renumbered-fa.pdf, corpus/*.md
import os, sys, zipfile, tempfile
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rtl_pdf
rtl_pdf.CODES |= {ord(c) for c in ',«»'} | {0x640}
from rtl_pdf import Font, LAB, FORMS, visual
from rtl_pdf2 import Doc2, Renum, brackets, hidden_md

KELK = os.path.join(LAB, '..', '..')
B = os.path.join(KELK, 'lib', 'pdf-base64-ttf-fonts', 'borna-rayaneh')
tmp = tempfile.mkdtemp()
with zipfile.ZipFile(os.path.join(KELK, 'assets', 'fonts', 'download', 'persian-fonts-ttf.zip')) as z:
    OUTLINE = z.extract('borna-rayaneh/BNAZANNO.TTF', tmp)
NAZ, NAZB, MIT, MITB, TITR = (os.path.join(B, n) for n in ('BNAZANIN.TTF', 'BNAZNNBD.TTF', 'BMITRA.TTF', 'BMITRABD.TTF', 'BTITRBD.TTF'))
WORD = b'Microsoft\xae Word 2016'
def out(name): return os.path.join(LAB, 'pdf', 'producers', name)
def corpus(name, text): open(os.path.join(LAB, 'corpus', name), 'w', encoding='utf8').write(text); print('corpus/' + name)

R, M = 530, 465
TITLE = 'گزارش باشگاه کتاب‌خوانی'
P1 = ('باشگاه کتاب‌خوانی محله در سال گذشته هر هفته یک نشست برگزار کرد و شمار اعضای آن از چهل نفر به بیش از صد و بیست نفر رسید. '
      'بیشتر اعضا دانش‌آموزان و دانشجویان هستند و نشست‌ها در سالن کوچک کتابخانه برگزار می‌شود.')
P2 = ('در هر نشست یک کتاب معرفی می‌شود و اعضا درباره آن گفت‌وگو می‌کنند. فهرست کتاب‌های هر فصل را خود اعضا با رای‌گیری انتخاب '
      'می‌کنند و کتابخانه نسخه‌های کافی از هر کتاب را فراهم می‌کند.')
P3 = ('برنامه سال آینده شامل دو کارگاه نویسندگی، یک جشن پایان فصل و بازدید از چاپخانه شهر است. هزینه این برنامه‌ها از کمک‌های '
      'مردمی و حق عضویت اعضا فراهم می‌شود.')
P4 = ('اعضای تازه می‌توانند در نخستین نشست هر ماه نام‌نویسی کنند. برای عضویت تنها کارت کتابخانه لازم است و شرکت در نشست‌ها '
      'برای همه رایگان است.')
P5 = ('پیشنهاد می‌شود ساعت نشست‌ها در زمستان یک ساعت زودتر باشد تا دانش‌آموزان پیش از تاریکی به خانه برسند. این پیشنهاد در '
      'نشست پایانی پاییز به رای گذاشته خواهد شد.')
P6 = ('گزارش بعدی باشگاه در پایان بهار منتشر می‌شود و فهرست کتاب‌های خوانده‌شده و شمار شرکت‌کنندگان هر نشست را در بر خواهد داشت.')

# ---- 1. the six faces, right ------------------------------------------------------------------------------------------
C = Doc2({'T': Font(TITR, 'ABCDEE+BTitrBold'), 'N': Font(NAZ, 'ABCDEE+BNazanin'), 'NB': Font(NAZB, 'ABCDEE+BNazaninBold'),
          'M': Font(MIT, 'ABCDEE+BMitra'), 'MB': Font(MITB, 'ABCDEE+BMitraBold'), 'O': Font(OUTLINE, 'ABCDEE+BNazaninOutline')})
C.line(1, TITLE, 770, 18, 0, 'T', center=C.w / 2)
y = 730
for f, p in (('N', P1), ('M', P2), ('N', P3), ('M', P4), ('N', P5)):
    y = C.para(1, p, y, 13, R, M, f) - 10
y = C.line(1, 'باشگاه کتاب‌خوانی محله', y - 8, 15, 0, 'O', center=C.w / 2) and y - 40
C.para(1, P6, y, 13, R, M, 'N')
C.write(out('word-bfonts--faces-fa.pdf'), WORD, 'faces-fa')
corpus('faces-fa.md', '# %s\n\n%s\n\n**باشگاه کتاب‌خوانی محله**\n\n%s\n' % (TITLE, '\n\n'.join((P1, P2, P3, P4, P5)), P6))

# ---- 2. a ToUnicode wrong for about half the forms (B Mitra Bold), for a few (B Mitra) --------------------------------
def scramble(F, every, kinds):
    """names every `every`-th joining form wrong, by turns: a space, another letter, the glyph index + 1"""
    other = 'جتسدفمزنهاو'; k = 0
    forms = sorted({F.gid(c) for v in FORMS.values() for c in v if c in F.cmap and F.gid(c) in F.tounicode})
    for i, g in enumerate(forms):
        if i % every: continue
        kind = kinds[k % len(kinds)]; k += 1
        wrong = ' ' if kind == 's' else other[k % len(other)] if kind == 'l' else chr(g + 1) if g + 1 < 256 else ' '
        if wrong != F.tounicode[g]: F.tounicode[g] = wrong
C = Doc2({'T': Font(TITR, 'BCDEEE+BTitrBold'), 'MB': Font(MITB, 'BCDFEE+BMitraBold'), 'M': Font(MIT, 'BCDGEE+BMitra')})
C.line(1, TITLE, 770, 18, 0, 'T', center=C.w / 2)
y = 730
for p in (P1, P2, P3): y = C.para(1, p, y, 13, R, M, 'MB') - 10
ITEMS = ['نشست‌ها هر هفته در سالن کتابخانه برگزار می‌شود.', 'فهرست کتاب‌ها را اعضا انتخاب می‌کنند.', 'شرکت در نشست‌ها برای همه رایگان است.']
for it in ITEMS:
    C.line(1, '- ' + it, y, 13, R - 14, 'M'); y -= 22
y = C.para(1, P5, y - 6, 13, R, M, 'MB')
F = C.fonts['MB']; scramble(F, 2, 'slsg')
F.tounicode[F.gid(0x640)] = 'ک'
F = C.fonts['M']; scramble(F, 7, 'ls')
C.write(out('word-bfonts--tounicode-fa.pdf'), WORD, 'tounicode-fa')
corpus('tounicode-fa.md', '# %s\n\n%s\n\n%s\n\n%s\n' % (TITLE, '\n\n'.join((P1, P2, P3)), '\n'.join('- ' + i for i in ITEMS), P5))

# ---- 3. brackets, the comma and the tatweel named wrong (B Nazanin) ---------------------------------------------------
Q1 = 'باشگاه کتاب‌خوانی محله (وابسته به کتابخانه مرکزی شهر) در سال 1404 کار خود را آغاز کرد و اکنون سه گروه (کودک، نوجوان و بزرگسال) دارد.'
Q2 = ('شمار امانت‌های کتابخانه در این سال 4,518,260 جلد بود که 27/45 درصد آن (یعنی بیش از یک‌سوم) به کتاب‌های کودک و نوجوان '
      'مربوط است. جمع هزینه‌ها 3,004 میلیون ریال و سهم کمک‌های مردمی 1,250 میلیون ریال بوده است.')
Q3 = 'برنامه سال آینده با همکاری کتابخانه مرکزی و دبستان‌های محله تهیه شده است.'
C = Doc2({'T': Font(TITR, 'ABCDEE+BTitrBold'), 'N': Font(NAZ, 'ABCDEE+BNazanin'), 'NB': Font(NAZB, 'ABCDEE+BNazaninBold')})
C.line(1, TITLE + ' (سال 1404)', 770, 18, 0, 'T', center=C.w / 2)
y = C.para(1, Q1, 730, 13, R, M, 'N') - 10
y = C.para(1, Q2, y, 13, R, M, 'N') - 10
# a line justified by tatweels: one before each letter that joins on (its initial or medial form), as far as the measure
JOIN = {v[k] for v in FORMS.values() if len(v) == 4 for k in (2, 3)}
gl = brackets(visual(Q3)); F = C.fonts['N']
room = M - C.width(gl, 13, 'N'); n = int(room / F.adv(0x640, 13)); slots = [i for i, (c, _) in enumerate(gl) if c in JOIN]
for i in sorted(slots[::max(1, len(slots) // n)][:n], reverse=True): gl.insert(i, (0x640, 'ـ'))
C.line(1, Q3, y, 13, R, 'N', gl=gl); y -= 31
C.line(1, 'هزینه‌ها (میلیون ریال)', y, 13, R, 'NB'); y -= 22
y = C.para(1, P3, y, 13, R, M, 'N')
F.tounicode[F.gid(0x29)] = 'م'; F.tounicode[F.gid(0x28)] = ' '; F.tounicode[F.gid(ord(','))] = '.'; F.tounicode[F.gid(0x640)] = 'ر'
C.write(out('word-bfonts--parens-fa.pdf'), WORD, 'parens-fa')
corpus('parens-fa.md', '# %s (سال 1404)\n\n%s\n\n%s\n\n%s\n\n## هزینه‌ها (میلیون ریال)\n\n%s\n' % (TITLE, Q1, Q2, Q3, P3))

# ---- 4. a print driver's renumbered fonts, and a line above the page --------------------------------------------------
STAMP = 'id000000 lab print driver - unregistered copy'
C = Doc2({'T': Renum(Font(TITR, 'AAAAAA+BTitrBold,Bold')), 'NB': Renum(Font(NAZB, 'AAAAAB+BNazaninBold,Bold'))})
C.base14(1, STAMP, 60, C.h + 100, 8, '1 g')
C.line(1, TITLE, 770, 18, 0, 'T', center=C.w / 2)
y = 730
for p in (P1, P2, P3, P4, P5, P6, Q3): y = C.para(1, p, y, 13, R, M, 'NB') - 10
C.write(out('driver-print--renumbered-fa.pdf'), b'Lab print driver', 'renumbered-fa')
corpus('renumbered-fa.md', '# %s\n\n%s\n\n%s' % (TITLE, '\n\n'.join((P1, P2, P3, P4, P5, P6, Q3)),
       hidden_md('fa', [(1, 'off', STAMP)])))
