# Lists as Word writes them, every marker with and without its space (rtl_pdf2.py; DejaVu Sans subsets; text of our
# own), for Kelk 2.9's list items:
#   · word-lists--markers-fa: a Persian page — numbered items «1)…» typed against their word (ASCII digits, a closing
#     bracket), «۱) …» with a space and «۴)…» without (Persian digits), «1.…» and «2. …» with a period, an item wrapped onto a second
#     line; bullets «-…», «- …», «•…», «• …»; numbered items with dash items set in under them; and numbered
#     paragraphs «1- …», which stay paragraphs (a number and a dash is a Persian paragraph's own numbering).
#   · word-lists--markers-en: the same in English, left to right.
# A number and its bracket or period against the item's first letter had been an item only right to left, and only
# when that letter has no joining forms: «1)اتاق» an item, «3)کف» a paragraph (the line is read in its presentation
# forms there). Markdown writes every ordered item «1.»: the delimiter is the producer's, the number is the item's.
# IMITATED: we cannot run Word here; the files follow what such files hold.
#   python3 scripts/make-lists29-rtl.py   → pdf/producers/word-lists--markers-fa.pdf, --markers-en.pdf and their corpus files
import os, sys
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rtl_pdf
rtl_pdf.CODES |= {ord(c) for c in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ,\'!?'} | set(range(0x6F0, 0x6FA)) | {0x2022}
from rtl_pdf import Font, LAB, REG, BOLD, visual
from rtl_pdf2 import Doc2

WORD = b'Microsoft\xae Word 2019'
def out(name): return os.path.join(LAB, 'pdf', 'producers', name)
def corpus(name, text): open(os.path.join(LAB, 'corpus', name), 'w', encoding='utf8').write(text); print('corpus/' + name)
R, L0, M = 530, 65, 465
SIZE, LEAD = 11, 19

def doc(lang): return Doc2({'F1': Font(REG, 'ABCDEF+DemoSans'), 'F2': Font(BOLD, 'ABCDEF+DemoSans-Bold')}, lang=lang)

def marked(marker, gap, text):
    """an item's line right to left, logical «marker[ ]text»: the text, then (at its right) the marker's sign
    mirrored — a closing bracket drawn «(» and named «)», as Word does — then its number, left to right"""
    num = marker.rstrip('.)•-')
    sign = marker[len(num):]
    gl = visual(text)
    if gap: gl = gl + [(0x20, ' ')]
    for c in sign: gl.append((ord('(') if c == ')' else ord(c), c))
    gl += [(ord(c), c) for c in num]
    return gl

def page(C, rtl, title, sections, last):
    """sections: [(heading, [(kind, marker, gap, text, level)])] — kind: 'li' an item (level 0 or 1), 'p' a paragraph"""
    y = 780
    x = (lambda d: R - d) if rtl else (lambda d: L0 + d)
    def put(text, size, f='F1', d=0, gl=None):
        if rtl: C.line(1, text, y, size, x(d), f, gl=gl)
        else: C.line(1, text, y, size, 0, f, ltr=True, center=None, gl=gl, ) if False else C.put(1, gl or [(ord(c), c) for c in text], x(d), y, size, f)
    put(title, 15, 'F2'); y -= 34
    for head, items in sections:
        put(head, 12.5, 'F2'); y -= 24
        for kind, marker, gap, text, level in items:
            d = 22 * level
            if kind == 'p':
                put(None, SIZE, d=d, gl=marked(marker, gap, text) if rtl else [(ord(c), c) for c in marker + (' ' if gap else '') + text]); y -= LEAD; continue
            # (a long item wraps: its next lines set in under its text, its lines but the last full to the measure)
            w = C.width([(ord(c), c) for c in marker + ' '], SIZE, 'F1')
            parts = C.wrap(text, SIZE, 'F1', M - d - w - 10) if rtl else wrap_en(C, text, M - d - w - 10)
            first = parts[0]
            put(None, SIZE, d=d, gl=marked(marker, gap, first) if rtl else [(ord(c), c) for c in marker + (' ' if gap else '') + first])
            y -= LEAD
            for more in parts[1:]:
                put(None, SIZE, d=d + w, gl=visual(more) if rtl else [(ord(c), c) for c in more]); y -= LEAD
        y -= 10
    for t in last:
        if rtl: y = C.para(1, t, y, SIZE, R, M) - 8
        else: put(t, SIZE); y -= LEAD

def wrap_en(C, text, measure):
    lines, cur = [], ''
    for word in text.split(' '):
        t = (cur + ' ' + word).strip()
        if cur and C.width([(ord(c), c) for c in t], SIZE, 'F1') > measure: lines.append(cur); cur = word
        else: cur = t
    return lines + [cur]

def md(title, sections, last):
    out = ['# ' + title, '']
    for head, items in sections:
        out += ['## ' + head, '']
        n = {0: 0, 1: 0}; prev = None
        for kind, marker, gap, text, level in items:
            if kind == 'p':
                if prev == 'li': out.append('')
                out += [marker + (' ' if gap else '') + text, '']; prev = 'p'; continue
            bullet = marker in ('-', '•')
            if level == 0 and not bullet: n[0] = int(''.join(str('۰۱۲۳۴۵۶۷۸۹'.index(c)) if c in '۰۱۲۳۴۵۶۷۸۹' else c for c in marker.rstrip('.)')))
            ind = '   ' * level
            out.append(ind + ('- ' if bullet else '%d. ' % n[0]) + text); prev = 'li'
        if out[-1] != '': out.append('')
    out += [t + '\n' for t in last]
    return '\n'.join(out).rstrip('\n') + '\n'

# ---- Persian ----------------------------------------------------------------------------------------------------------
FA_T = 'فهرست کارهای جشن باشگاه'
FA = [
    ('شماره‌ها با پرانتز، بی‌فاصله', [('li', '1)', False, 'آماده کردن سالن بزرگ کتابخانه', 0), ('li', '2)', False, 'کرایه کردن صندلی و میز', 0),
                                     ('li', '3)', False, 'فرستادن دعوت‌نامه برای همه اعضا', 0), ('li', '4)', False, 'گرفتن عکس یادگاری در پایان جشن با همه مهمانان، اعضای تازه و کارکنان کتابخانه، و فرستادن آن برای همه', 0)]),
    ('شماره‌های فارسی با پرانتز، با فاصله و بی‌فاصله', [('li', '۱)', True, 'چای و شیرینی', 0), ('li', '۲)', True, 'کتاب‌های هدیه', 0), ('li', '۳)', True, 'گل برای میز سخنران', 0), ('li', '۴)', False, 'بادکنک برای کودکان', 0)]),
    ('شماره‌ها با نقطه', [('li', '1.', False, 'خواندن گزارش سال', 0), ('li', '2.', True, 'معرفی اعضای تازه', 0), ('li', '3.', False, 'پخش کردن هدیه‌ها', 0)]),
    ('نشانه‌ها', [('li', '-', False, 'یک میز برای نام‌نویسی', 0), ('li', '-', True, 'یک میز برای فروش کتاب', 0),
                  ('li', '•', False, 'چند صندلی برای کودکان', 0), ('li', '•', True, 'یک گوشه برای عکس گرفتن', 0)]),
    ('کارها و بخش‌هایشان', [('li', '1)', True, 'آماده کردن سالن', 0), ('li', '-', True, 'چیدن صندلی‌ها', 1), ('li', '-', True, 'روشن کردن چراغ‌ها', 1),
                             ('li', '2)', True, 'پذیرایی', 0), ('li', '-', False, 'دم کردن چای', 1), ('li', '-', False, 'چیدن شیرینی', 1)]),
    ('بندهای شماره‌دار یک نامه', [('p', '1-', True, 'جشن در روز پنجشنبه برگزار می‌شود.', 0), ('p', '2-', True, 'شرکت در جشن برای همه آزاد است.', 0)]),
]
FA_END = ['هر عضو می‌تواند یکی از این کارها را بر عهده بگیرد.']
C = doc('fa-IR'); page(C, True, FA_T, FA, FA_END)
C.write(out('word-lists--markers-fa.pdf'), WORD, 'markers-fa')
corpus('markers-fa.md', md(FA_T, FA, FA_END))

# ---- English ----------------------------------------------------------------------------------------------------------
EN_T = 'Tasks for the club party'
EN = [
    ('Numbers with a bracket, no space', [('li', '1)', False, 'Prepare the main hall of the library', 0), ('li', '2)', False, 'Hire chairs and tables', 0),
                                          ('li', '3)', False, 'Send an invitation to every member', 0), ('li', '4)', False, 'Take a group photo at the end of the party with every guest, the new members and the staff of the library, and send it to everyone', 0)]),
    ('Numbers with a bracket, with and without a space', [('li', '1)', True, 'Tea and cakes', 0), ('li', '2)', True, 'Books as gifts', 0), ('li', '3)', True, 'Flowers for the speaker', 0), ('li', '4)', False, 'Balloons for the children', 0)]),
    ('Numbers with a period', [('li', '1.', False, 'Read the report of the year', 0), ('li', '2.', True, 'Welcome the new members', 0), ('li', '3.', False, 'Hand out the gifts', 0)]),
    ('Bullets', [('li', '-', False, 'A table for signing up', 0), ('li', '-', True, 'A table for selling books', 0),
                 ('li', '•', False, 'Some chairs for children', 0), ('li', '•', True, 'A corner for photos', 0)]),
    ('Tasks and their parts', [('li', '1)', True, 'Prepare the hall', 0), ('li', '-', True, 'Set out the chairs', 1), ('li', '-', True, 'Turn on the lights', 1),
                               ('li', '2)', True, 'Refreshments', 0), ('li', '-', False, 'Make the tea', 1), ('li', '-', False, 'Lay out the cakes', 1)]),
]
EN_END = ['Every member can take one of these tasks.']
C = doc('en-US'); page(C, False, EN_T, EN, EN_END)
C.write(out('word-lists--markers-en.pdf'), WORD, 'markers-en')
corpus('markers-en.md', md(EN_T, EN, EN_END))
