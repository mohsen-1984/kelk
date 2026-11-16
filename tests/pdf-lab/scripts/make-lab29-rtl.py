# Kelk 2.9's other cases, glyph by glyph (rtl_pdf2.py; DejaVu Sans subsets). Text of our own.
#   · driver-print--renumbered-en: an English page in a print driver's simple font — codes numbered in order of first use,
#     no ToUnicode, no glyph names — and a line in white Helvetica above the page: read by its codes it is gibberish;
#   · word-hidden--hidden-fa: a Persian page holding text no reader sees — a line above the page, a white line on the
#     white page, a line at half a point, a line in render mode 3 with no picture under it — and, for contrast, a white
#     title on a dark band, which every reader sees and which stays in the text;
#   · word-contact--contact-fa: a paragraph whose last line stops short at the right, then an address centred on a line
#     of its own behind a colon (a new line by its alignment, not a wrap), then centred «label: value» lines whose values
#     (a phone number, an e-mail, a site) have more Latin characters than the label has letters; each value a link;
#   · word-labels--labels-fa: a report's dash-marked bold labels («- برنامه‌ها»), bold sub-labels right under an item's
#     short line at the items' own pitch, dash items, numbered items wrapped and justified.
# IMITATED: we cannot run Word or a print driver here; the files follow what such files hold.
#   python3 scripts/make-lab29-rtl.py   → pdf/producers/driver-print--renumbered-en.pdf, word-hidden--hidden-fa.pdf,
#                                         word-contact--contact-fa.pdf, word-labels--labels-fa.pdf and their corpus files
import os, sys
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rtl_pdf
rtl_pdf.CODES |= {ord(c) for c in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ,\'!?@_'}
from rtl_pdf import Font, LAB, REG, BOLD, visual
from rtl_pdf2 import Doc2, Renum, brackets, hidden_md

WORD = b'Microsoft\xae Word 2016'
def out(name): return os.path.join(LAB, 'pdf', 'producers', name)
def corpus(name, text): open(os.path.join(LAB, 'corpus', name), 'w', encoding='utf8').write(text); print('corpus/' + name)
R, L0, M = 530, 65, 465

# ---- 1. a print driver's renumbered font, English ---------------------------------------------------------------------
EN = ['The reading club of the neighbourhood met every week last year, and its members grew from forty to more than a '
      'hundred and twenty. Most of them are school pupils and students, and the meetings are held in the small hall of '
      'the library.',
      'At every meeting one book is introduced and the members talk about it. The members choose the books of each '
      'season by a vote, and the library provides enough copies of every book.',
      'Next year the club plans two writing workshops, a party at the end of the season and a visit to the printing '
      'house of the town. The cost is covered by donations and by the membership fee.',
      'New members can sign up at the first meeting of every month. A library card is all they need, and the meetings '
      'are free for everyone.']
STAMP = 'id000000 lab print driver - unregistered copy'
C = Doc2({'T': Renum(Font(BOLD, 'AAAAAA+DemoSans,Bold')), 'F': Renum(Font(REG, 'AAAAAB+DemoSans'))}, lang='en-US')
C.base14(1, STAMP, 60, C.h + 100, 8, '1 g')
C.line(1, 'The reading club', 770, 18, 0, 'T', ltr=True, center=C.w / 2)
y = 730
for p in EN:
    cur = ''
    for w in p.split(' ') + [None]:
        t = (cur + ' ' + w).strip() if w is not None else None
        if t is None or C.width([(ord(c), c) for c in t], 11, 'F') > M:
            gl = [(ord(c), c) for c in cur]; C.put(1, gl, L0, y, 11, 'F'); y -= 16; cur = w or ''
        else: cur = t
    y -= 10
C.write(out('driver-print--renumbered-en.pdf'), b'Lab print driver', 'renumbered-en')
corpus('renumbered-en.md', '# The reading club\n\n%s\n\n%s' % ('\n\n'.join(EN), hidden_md('en', [(1, 'off', STAMP)])))

# ---- 2. text no reader sees -------------------------------------------------------------------------------------------
P1 = ('باشگاه کتاب‌خوانی محله در سال گذشته هر هفته یک نشست برگزار کرد و شمار اعضای آن از چهل نفر به بیش از صد و بیست نفر رسید. '
      'بیشتر اعضا دانش‌آموزان و دانشجویان هستند و نشست‌ها در سالن کوچک کتابخانه برگزار می‌شود.')
P2 = ('در هر نشست یک کتاب معرفی می‌شود و اعضا درباره آن گفت‌وگو می‌کنند. فهرست کتاب‌های هر فصل را خود اعضا با رای‌گیری انتخاب '
      'می‌کنند و کتابخانه نسخه‌های کافی از هر کتاب را فراهم می‌کند.')
P3 = ('برنامه سال آینده شامل دو کارگاه نویسندگی، یک جشن پایان فصل و بازدید از چاپخانه شهر است. هزینه این برنامه‌ها از کمک‌های '
      'مردمی و حق عضویت اعضا فراهم می‌شود.')
H_OFF, H_TINY = 'lab hidden line: this text is drawn above the page', 'lab hidden line: this text is drawn at half a point'
H_WHITE, H_INV = 'این جمله سفید روی سفید نوشته شده است.', 'این جمله با حالت نامریی نوشته شده است.'
C = Doc2({'F1': Font(REG, 'ABCDEE+DemoNazanin'), 'F2': Font(BOLD, 'ABCDEE+DemoNazanin-Bold')})
C.base14(1, H_OFF, 60, C.h + 60, 9)
C.line(1, 'گزارش باشگاه کتاب‌خوانی', 770, 16, R, 'F2')
y = C.para(1, P1, 735, 11, R, M) - 8
C.line(1, H_WHITE, y, 11, R, color='1 g'); y -= 26
C.op(1, '0.15 0.25 0.45 rg %.2f %.2f %.2f 26 re f 0 g' % (L0, y - 8, M))            # a dark band, its title in white: visible
C.line(1, 'برنامه سال آینده', y, 13, R - 8, 'F2', color='1 g'); y -= 34
y = C.para(1, P3, y, 11, R, M) - 8
C.base14(1, H_TINY, L0, y, 0.5); y -= 6
C.line(1, H_INV, y - 6, 11, R, mode=3); y -= 30
C.para(1, P2, y, 11, R, M)
C.write(out('word-hidden--hidden-fa.pdf'), WORD, 'hidden-fa')
corpus('hidden-fa.md', '# گزارش باشگاه کتاب‌خوانی\n\n%s\n\n## برنامه سال آینده\n\n%s\n\n%s\n\n%s' % (P1, P3, P2,
       hidden_md('fa', [(1, 'off', H_OFF), (1, 'white', H_WHITE), (1, 'tiny', H_TINY), (1, 'invisible', H_INV)])))

# ---- 3. an address on its own centred line, and centred «label: value» lines ------------------------------------------
INTRO = ('کارگاه‌های پاییز باشگاه کتاب‌خوانی در سه هفته پیاپی برگزار می‌شود و شرکت در آن‌ها برای همه اعضا رایگان است. هر کارگاه '
         'دو ساعت است و در سالن کوچک کتابخانه برگزار می‌شود.')
LAST = ['برای شرکت در کارگاه‌ها باید پیش از پایان مهر نام‌نویسی کنید. فرم نام‌نویسی و برنامه کامل کارگاه‌ها', 'در وب‌سایت باشگاه آمده است']
URL = 'https://example.org/2026/autumn-workshops/'
PAIRS = [('تلفن', '05138001234', 'tel:05138001234'), ('ایمیل', 'club@example.org', 'mailto:club@example.org'),
         ('وب‌سایت', 'www.example.org', 'https://www.example.org/')]
C = Doc2({'F1': Font(REG, 'ABCDEE+DemoNazanin'), 'F2': Font(BOLD, 'ABCDEE+DemoNazanin-Bold')})
C.line(1, 'کارگاه‌های پاییز', 770, 16, R, 'F2')
y = C.para(1, INTRO, 735, 11, R, M) - 8
C.line(1, LAST[0], y, 11, R, justify=M); y -= 17.6
C.line(1, LAST[1], y, 11, R); y -= 17.6                                                # stops short, at the right
x0, x1 = C.line(1, ': ' + URL, y, 11, 0, ltr=True, center=C.w / 2)                    # centred: a line of its own
C.link(1, x0 + C.width([(ord(c), c) for c in ': '], 11, 'F1'), y - 3, x1, y + 9, URL); y -= 40
C.line(1, 'راه‌های تماس', y, 12, 0, 'F2', center=C.w / 2); y -= 22
for label, value, uri in PAIRS:
    x0, x1 = C.line(1, label + ': ' + value, y, 11, 0, center=C.w / 2)                 # the value at the left, the label at the right
    C.link(1, x0, y - 3, x0 + C.width([(ord(c), c) for c in value], 11, 'F1'), y + 9, uri); y -= 17.6
C.write(out('word-contact--contact-fa.pdf'), WORD, 'contact-fa')
corpus('contact-fa.md', '# کارگاه‌های پاییز\n\n%s\n\n%s\n\n: [%s](%s)\n\n## راه‌های تماس\n\n%s\n' % (INTRO, ' '.join(LAST), URL, URL,
       '\n\n'.join('%s: [%s](%s)' % p for p in PAIRS)))

# ---- 4. dash-marked bold labels, sub-labels under a short item, numbered items ----------------------------------------
HEAD = '2- برنامه‌ها و پیشنهادهای باشگاه'
LEAD = ('باشگاه کتاب‌خوانی با تکیه بر توان اعضای خود و با همکاری کتابخانه مرکزی شهر می‌کوشد کتاب‌خوانی را در محله گسترش دهد و '
        'برای این کار برنامه‌های زیر را در نظر دارد.')
GROUPS = [('خدمات کتابخانه', ['افزایش ساعت کار سالن مطالعه', 'خرید کتاب‌های تازه برای گروه کودک و نوجوان با نظر اعضا و با توجه به فهرست پیشنهادی آموزگاران دبستان‌های محله', 'راه‌اندازی بخش امانت کتاب صوتی']),
          ('همکاری با دیگران', ['همکاری با دبستان‌های محله', 'دعوت از نویسندگان شهر']),
          ('آموزش اعضا', ['برگزاری کارگاه نویسندگی', 'برگزاری نشست نقد کتاب'])]
OPPS = ['نشست‌های زمستان یک ساعت زودتر آغاز شود تا دانش‌آموزان پیش از تاریکی به خانه برسند و خانواده‌ها نیز بتوانند در پایان هر نشست همراه فرزندان خود باشند',
        'هر فصل یک نشست ویژه کودکان برگزار شود',
        'فهرست کتاب‌های هر فصل دو هفته پیش از آغاز آن در وب‌سایت باشگاه و روی تابلوی کتابخانه در دسترس همه اعضا گذاشته شود']
C = Doc2({'F1': Font(REG, 'ABCDEE+DemoNazanin'), 'F2': Font(BOLD, 'ABCDEE+DemoNazanin-Bold')})
C.line(1, HEAD, 770, 14, R, 'F2')
y = C.para(1, LEAD, 742, 11, R, M) - 14
C.line(1, '-برنامه‌ها', y, 12, R, 'F2'); y -= 20
for g, (label, items) in enumerate(GROUPS):
    C.line(1, label, y, 11, R, 'F2'); y -= 19
    for it in items:
        ls = C.wrap('- ' + it, 11, 'F1', M)
        for k, l in enumerate(ls):
            C.line(1, l, y, 11, R, justify=M if k < len(ls) - 1 else None); y -= 19
y -= 14
C.line(1, '-  پیشنهادها', y, 12, R, 'F2'); y -= 22
for n, it in enumerate(OPPS):
    ls = C.wrap('%d. %s' % (n + 1, it), 11, 'F1', M)
    for k, l in enumerate(ls):
        C.line(1, l, y, 11, R, justify=M if k < len(ls) - 1 else None); y -= 19
C.write(out('word-labels--labels-fa.pdf'), WORD, 'labels-fa')
corpus('labels-fa.md', '# %s\n\n%s\n\n- **برنامه‌ها**\n\n%s\n\n- **پیشنهادها**\n\n%s\n' % (HEAD, LEAD,
       '\n\n'.join('**%s**\n\n%s' % (label, '\n'.join('- ' + i for i in items)) for label, items in GROUPS),
       '\n'.join('%d. %s' % (n + 1, i) for n, i in enumerate(OPPS))))
