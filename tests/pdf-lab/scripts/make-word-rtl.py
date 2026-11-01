# A Persian memo as Word draws it (Microsoft Word, Microsoft Print to PDF) — built by hand, glyph by glyph, so
# each of Word's habits is in it on purpose:
#   · the font's cmap names its glyphs by their presentation forms; the ToUnicode names them by the base letter,
#     the Persian yeh and kaf by the Arabic ي ك (GDI), lam-alef by «لا» (one glyph, two letters)
#   · a ZWNJ is not drawn at all (the shapes show it: «تفاهم‌نامه»), or drawn as a zero-width glyph where its
#     origin falls, between two letters that join («پ‌یش» for «پیش‌بینی»)
#   · a mirrored bracket is named by its logical character: the ')' shape at the right of «ماده (1)» is '('
#   · one digit glyph is named in the Persian system, the others in ASCII: the cmap names all ASCII
#   · 1-pt text (a code) in the letterhead; a letterhead line at the far left of the page (it pulled the mirrored right
#     margin out, and every flush-right line looked indented)
#   · numbered clauses «2-1. …», one per line, flush right; one after a long line that ends a sentence
#   · a bullet at the right of its text, a tab away; «C++» drawn left to right, its signs at its right
#   · a running head in a frame of its own on both pages: its text between two separators that end on a rule
#     under it (the rule rose into a thematic break at every page's top), a footer the same way up
#   · a full stop in bold after a plain word (Markdown: «رود**.**» is literal asterisks — it must come out plain)
#   · a clause highlighted (a yellow fill hugging its line: no quote box); a second-level bullet, Word's Courier «o»
#   · page 2 also: a payslip's band — one ruled row whose columns hold an item a line (no rules between them:
#     they are rows), and a table whose cells wrap their text over full lines (no rows: one cell each)
#   · kashidas a justified line is stretched with («مشتـــرک»: Word's kashida justification — not text); an amount
#     whose thousands are parted by the Arabic comma («12،500،000»: one number, read left to right)
#   · page 2: a ruled table with its title in a cell as wide as the table on top of it, and a total in a box of
#     its own under it — the first column's cell above it has no bottom rule (an open corner)
#   · a calligraphic «بسمه تعالی» over the letterhead, as PDFium prints Word's: a font whose box is 2.7 em tall
#     (Nastaliq's), its letters on a slope (each a little higher or lower than the last), and fake bold — every
#     letter and space drawn twice, the copy 0.32 pt to the side (it came back «ببسسممتتلل هه ععاایی»); under it
#     «صلوات بر محمد و آل محمد» as Prince draws it — its words out of order, the last one 6 pt up (it read
#     «محمد صلوات بر محمد و آل»)
#   · a signature after the list: name over title, bold, centred at the far side (it came back one line, in the item)
#   · page 2, last: a copy list as letters write it — «-» against its word, and once «-» drawn 3 pt off as a run of
#     its own (the items had run into one paragraph); a number set between words with gaps and no space glyphs
#     (Prince at a bidi run's edge: «حداکثر3روز»)
# The Markdown that must come back is corpus/word-rtl.md.
#   python3 scripts/make-word-rtl.py      → pdf/word-print--word-rtl.pdf, corpus/word-rtl.md
import os, io, zlib
from fontTools.ttLib import TTFont
from fontTools import subset

LAB = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
from rtl_pdf import dejavu
FONT = dejavu('DejaVuSans.ttf')

# ── joining and presentation forms ─────────────────────────────────────
FORMS = {  # base → isolated, final, initial, medial
 'ا': 'FE8D FE8E', 'آ': 'FE81 FE82', 'ب': 'FE8F FE90 FE91 FE92', 'پ': 'FB56 FB57 FB58 FB59', 'ت': 'FE95 FE96 FE97 FE98',
 'ج': 'FE9D FE9E FE9F FEA0', 'چ': 'FB7A FB7B FB7C FB7D', 'ح': 'FEA1 FEA2 FEA3 FEA4', 'خ': 'FEA5 FEA6 FEA7 FEA8',
 'د': 'FEA9 FEAA', 'ر': 'FEAD FEAE', 'ز': 'FEAF FEB0', 'س': 'FEB1 FEB2 FEB3 FEB4', 'ش': 'FEB5 FEB6 FEB7 FEB8',
 'ص': 'FEB9 FEBA FEBB FEBC', 'ط': 'FEC1 FEC2 FEC3 FEC4', 'ظ': 'FEC5 FEC6 FEC7 FEC8', 'ع': 'FEC9 FECA FECB FECC',
 'ف': 'FED1 FED2 FED3 FED4', 'ق': 'FED5 FED6 FED7 FED8', 'ک': 'FB8E FB8F FB90 FB91', 'گ': 'FB92 FB93 FB94 FB95',
 'ل': 'FEDD FEDE FEDF FEE0', 'م': 'FEE1 FEE2 FEE3 FEE4', 'ن': 'FEE5 FEE6 FEE7 FEE8', 'ه': 'FEE9 FEEA FEEB FEEC',
 'و': 'FEED FEEE', 'ی': 'FBFC FBFD FBFE FBFF', 'ذ': 'FEAB FEAC', 'ژ': 'FB8A FB8B', 'ـ': '0640 0640 0640 0640',
 'ث': 'FE99 FE9A FE9B FE9C', 'ض': 'FEBD FEBE FEBF FEC0', 'غ': 'FECD FECE FECF FED0', 'ئ': 'FE89 FE8A FE8B FE8C', 'أ': 'FE83 FE84',
}
FORMS = {k: [int(h, 16) for h in v.split()] for k, v in FORMS.items()}
DUAL = {k for k, v in FORMS.items() if len(v) == 4}
NAME = {'ی': 'ي', 'ک': 'ك'}             # GDI's ToUnicode for the Persian yeh and kaf
PERSIAN_DIGIT = {'3'}                     # a digit glyph Word named in the Persian system
ZWNJ = '‌'

def is_ar(c): return c in FORMS or c == ZWNJ or c in '،؛؟'

def shape(word):
    """logical Arabic text (no spaces) → [(code drawn, ToUnicode name)] in logical order; ZWNJ kept as None marks"""
    out, i = [], 0
    while i < len(word):
        c = word[i]
        if c == ZWNJ: out.append(None); i += 1; continue
        if c not in FORMS: out.append((ord(c), c)); i += 1; continue
        prev = word[i - 1] if i else ''
        joins_prev = prev in DUAL
        if c == 'ل' and i + 1 < len(word) and word[i + 1] in 'اآ':
            out.append((0xFEFC if joins_prev else 0xFEFB, 'لا')); i += 2; continue
        nxt = word[i + 1] if i + 1 < len(word) else ''
        joins_next = c in DUAL and nxt in FORMS
        f = FORMS[c]
        code = f[3] if joins_prev and joins_next else f[1] if joins_prev else f[2] if joins_next else f[0]
        # (the isolated Persian yeh drawn with the base code's glyph: the cmap names it ی, the ToUnicode ي)
        if c == 'ی' and code == f[0]: code = 0x6CC
        out.append((code, NAME.get(c, c)))
        i += 1
    return out

def visual(text, ltr_signs='+'):
    """one RTL line, logical → [(code, tounicode)] left to right: Arabic runs reversed, Latin / digit runs kept"""
    # runs: 'R' Arabic words and the spaces / neutrals between them, 'L' Latin and digits (with '+': «C++»)
    def kind(c):
        if c == '،': return 'N'             # (a separator: between two digit runs it is part of the number)
        if is_ar(c): return 'R'
        if c.isascii() and (c.isalnum() or c in ltr_signs): return 'L'
        return 'N'
    runs, cur = [], None
    for c in text:
        k = kind(c)
        if cur and (cur[0] == k or (k == 'L' and cur[0] == 'L')): cur[1].append(c)
        else: cur = [k, [c]]; runs.append(cur)
    # a '-' between two digit runs belongs to the number («2-1»); the '.' after it does not (it shows at its left)
    merged = []
    for i, (k, cs) in enumerate(runs):
        if merged and k == 'N' and ''.join(cs) in ('-', ',', '،') and merged[-1][0] == 'L' and i + 1 < len(runs) and runs[i + 1][0] == 'L':
            merged[-1][1].extend(cs); continue
        if merged and k == 'L' and merged[-1][0] == 'L': merged[-1][1].extend(cs); continue
        merged.append([k, list(cs)])
    items = []          # logical order: (level, [glyph codes...] in logical order)
    for k, cs in merged:
        s = ''.join(cs)
        if k == 'L':
            items.append((2, [(ord(c), str(c)) for c in s]))
        else:
            gl = []
            for w in s.split(' '):
                gl.extend(shape(w) if any(is_ar(c) for c in w) else [(ord(c), c) for c in w])
                gl.append((32, ' '))
            gl.pop()
            items.append((1, gl))
    # display: level 2 runs left to right, the whole line reversed (base level 1); brackets mirror at level 1
    out = []
    for lvl, gl in reversed(items):
        if lvl == 2: out.extend(gl)
        else:
            for g in reversed(gl):
                if g is None: out.append(None); continue
                code, name = g
                mir = {ord('('): ord(')'), ord(')'): ord('(')}.get(code)
                out.append((mir, name) if mir else g)     # the mirrored shape, named by the logical bracket
    return out

# ── the page's lines ───────────────────────────────────────────────────
R = 525.0           # the text column's right edge (right to left: where lines start)
LINES1 = [          # (y, size, text, align)  align: 'r' flush right, 'l' at x, 'c' centred
 (770, 12, 'سازمان نمونه', ('l', 33)),                      # the letterhead, far left
 (740, 16, 'تفاهم‌نامه همکاری', 'c'),
 (705, 14, 'ماده (1): موضوع', 'r'),
 (680, 12, 'این تفاهم‌نامه به‌منظور توسعه همکاری‌های علمی و پژوهشی میان دو سازمان و بهره‌گیری', 'r'),
 (660, 12, 'از ظرفیت‌های تخصصی و اطلاعات طرفین تنظیم می‌شود و پیش‌بینی می‌شود که نتایج آن', 'r'),
 (640, 12, 'در سامانه‌های هوشمند به کار رود.', 'r'),
 (605, 14, 'ماده (2): همکاری‌ها', 'r'),
 (580, 12, '2-1. استفاده از ظرفیت‌های علمی؛', 'r'),
 (560, 12, '2-2. همکاری در طراحی سامانه‌ها؛', 'r'),
 (540, 12, '2-3. تبادل اطلاعات میان طرفین.', 'r'),
 (505, 12, 'نمایندگان طرفین هر سه ماه یک بار جلسه مشتـــرک دارند و گـــزارش آن را برای هر دو', 'r'),
 (485, 12, 'سازمان می‌فرستند و پس از تأیید طرفین برای اجرا به واحدهای ذی‌ربط ابلاغ می‌کنند.', 'r'),
 (465, 12, '2-4. کارگروه سی روز پس از امضای تفاهم‌نامه با بودجه 12،500،000 ریال تشکیل می‌شود.', 'r'),
 (430, 12, 'نرم‌افزارهای مجاز:', 'r'),
]
BULLETS = [(405, 'C++ — زبان برنامه‌نویسی'), (365, 'Python — زبان اسکریپت')]
SUB = (385, 'pip — مدیر بسته‌ها')                           # the second level: Courier «o» before it
SIGN = [(330, 'رضا نمونه'), (316, 'مدیر واحد فناوری نمونه')]   # the signature: name over title, bold, centred at the far side
TINY = (300, 775, 1, 'کد:2/7')
HEAD, FOOT = 'تفاهم‌نامه نمونه', 'دبیرخانه نمونه'
HIGHLIGHT = 560                                             # the clause highlighted
BOLD_STOP = 640                                             # its full stop in bold, after a plain word (Word)
# the misplaced ZWNJ: in «پیش‌بینی» it is drawn between پ and ی (its origin) instead of after ش
MISPLACE = 'پیش‌بینی'

BISM = (800, 16, 'بسمه تعالی', [0, 0, -2, -5, -4, -2, -5, -5, -1, -5])   # y, size, text, each glyph's rise (logical order)
# a second calligraphic line as Prince draws one: its words out of order, the last word set 6 pt up
SALAVAT = (783, 13, 'صلوات بر محمد و آل محمد', [2, 0, 4, 1, 3, 5], 6)
EXPECTED = """بسمه تعالی

صلوات بر محمد و آل محمد

سازمان نمونه

# تفاهم‌نامه همکاری

## ماده (1): موضوع

این تفاهم‌نامه به‌منظور توسعه همکاری‌های علمی و پژوهشی میان دو سازمان و بهره‌گیری از ظرفیت‌های تخصصی و اطلاعات طرفین تنظیم می‌شود و پیش‌بینی می‌شود که نتایج آن در سامانه‌های هوشمند به کار رود.

## ماده (2): همکاری‌ها

2-1. استفاده از ظرفیت‌های علمی؛

2-2. همکاری در طراحی سامانه‌ها؛

2-3. تبادل اطلاعات میان طرفین.

نمایندگان طرفین هر سه ماه یک بار جلسه مشترک دارند و گزارش آن را برای هر دو سازمان می‌فرستند و پس از تأیید طرفین برای اجرا به واحدهای ذی‌ربط ابلاغ می‌کنند.

2-4. کارگروه سی روز پس از امضای تفاهم‌نامه با بودجه 12،500،000 ریال تشکیل می‌شود.

نرم‌افزارهای مجاز:

- C++ — زبان برنامه‌نویسی
  - pip — مدیر بسته‌ها
- Python — زبان اسکریپت

**رضا نمونه**\\
**مدیر واحد فناوری نمونه**

فهرست توسعه‌ها

| ردیف | عنوان | نفرساعت |
| --- | --- | --- |
| 1 | دستیار پاسخگو | 100 |
| 2 | عامل خزنده | 300 |
|  |  | 400 |

| شرح | مبلغ |
| --- | --- |
| حق شغل | 91,800 |
| کمک هزینه اولاد | 45,395 |
| فوق العاده سختی شرایط کار | 22,032 |
| اضافه کاری | 133,995 |

| طرح | شرح |
| --- | --- |
| زائریار | دستیار هوشمند برای زائران داخلی و خارجی که پرسش‌های پرتکرار را پاسخ می‌دهد و راه را نشان می‌دهد |

رونوشت:

- معاون محترم نمونه، جهت استحضار
- مدیر محترم نمونه، جهت اطلاع

مهلت پاسخ حداکثر 3 روز است.
"""

# ── the fonts: DejaVu Sans and Sans Bold, cut to what the pages draw (their cmaps kept: presentation forms and all) ──
BOLD = {740, 705, 605}                       # the lines in bold (the title, the clauses' headings — Word's are bold)
PAY = [('حق شغل', '91,800'), ('کمک هزینه اولاد', '45,395'), ('فوق العاده سختی شرایط کار', '22,032'), ('اضافه کاری', '133,995')]
WRAP = ['دستیار هوشمند برای زائران داخلی و', 'خارجی که پرسش‌های پرتکرار را پاسخ', 'می‌دهد و راه را نشان می‌دهد']
texts = [BISM[2], SALAVAT[2], 'رونوشت:', '-معاون محترم نمونه، جهت استحضار', 'مدیر محترم نمونه، جهت اطلاع', 'مهلت پاسخ حداکثر', '3', 'روز است.', '-'] + [t for _, t in SIGN] + [t for _, _, t, _ in LINES1] + [t for _, t in BULLETS] + [a for a, _ in PAY] + [b for _, b in PAY] + WRAP + ['شرح', 'مبلغ', 'طرح', 'زائریار', SUB[1], HEAD, FOOT, 'صفحه 1 از 2', 'صفحه 2 از 2', 'o', TINY[3], 'فهرست توسعه‌ها', 'ردیف', 'عنوان', 'نفرساعت',
         'دستیار پاسخگو', 'عامل خزنده', '1', '2', '100', '300', '400', '•']
missing = {c for t in texts for c in t if '\u0600' <= c <= '\u06ff' and c not in FORMS and c not in '،؛؟'}
assert not missing, missing
codes = set()
for t in texts:
    for g in visual(t):
        if g: codes.add(g[0])
codes |= {0x200C, 0x20, 0x2022, 0x6CC, 0x64A, 0x6A9, 0x643} | {ord(c) for c in '0123456789'}
# (the base letters too: a glyph the cmap names by a base letter is its isolated form)
codes |= {ord(c) for c in FORMS}

class Font:
    def __init__(self, key, path, ps):
        src = TTFont(path); cm = src.getBestCmap()
        opts = subset.Options(); opts.layout_features = []; opts.notdef_outline = True; opts.name_IDs = ['*']; opts.glyph_names = True
        sub = subset.Subsetter(opts); sub.populate(unicodes=sorted(c for c in codes if c in cm)); sub.subset(src)
        buf = io.BytesIO(); src.save(buf); self.bytes = buf.getvalue()
        self.font = TTFont(io.BytesIO(self.bytes)); self.cmap = self.font.getBestCmap()
        self.upem = self.font['head'].unitsPerEm; self.key = key; self.ps = ps
        self.tounicode = {}                  # gid → the text Word names it by
    def gid(self, code): return self.font.getGlyphID(self.cmap[code])
    def adv(self, code, size): return self.font['hmtx'][self.cmap[code]][0] * size / self.upem
FONTS = {'F1': Font('F1', FONT, 'AAAAAA+DejaVuSans'), 'F2': Font('F2', FONT.replace('DejaVuSans.ttf', 'DejaVuSans-Bold.ttf'), 'AAAAAB+DejaVuSans-Bold'),
         'F3': Font('F3', FONT.replace('DejaVuSans.ttf', 'DejaVuSansMono.ttf'), 'AAAAAC+DejaVuSansMono'),
         'F4': Font('F4', FONT, 'AAAAAD+IranNastaliqLike')}
TALL = {'F4': (-311, -1193, 2851, 1477)}            # its box (1000 units): a calligraphic font's, 2.67 em tall

def name_of(code, name):
    if code == 0x200C: return ZWNJ
    if name in ('(', ')'): return name
    if name.isdigit() and name in PERSIAN_DIGIT: return chr(0x6F0 + int(name))
    return name

ops = {1: [], 2: []}
def put_glyphs(page, gl, x, y, size, f='F1'):
    F = FONTS[f]
    for code, name, w in gl:
        g = F.gid(code); F.tounicode.setdefault(g, name_of(code, name))
        ops[page].append('BT /%s %.2f Tf 1 0 0 1 %.3f %.3f Tm <%04X> Tj ET' % (f, size, x, y, g))
        x += w
def layout(text, size, f='F1'):
    """→ [(code, name, advance)] left to right; the ZWNJ Word did not draw is left out"""
    return [(g[0], g[1], FONTS[f].adv(g[0], size)) for g in visual(text) if g is not None]
def line(page, text, y, size, align, f='F1'):
    gl = layout(text, size, f)
    width = sum(w for _, _, w in gl)
    x = R - width if align == 'r' else (297.6 - width / 2) if align == 'c' else align[1]
    if MISPLACE in text:
        # the drawn ZWNJ of «پیش‌بینی», at its origin: the left edge of پ (between پ and the ی that joins it)
        xs, cx = [], x
        for code, name, w in gl: xs.append((code, cx, w)); cx += w
        pe = [q for q in xs if q[0] == 0xFB58]
        if pe: put_glyphs(page, [(0x200C, ZWNJ, 0)], pe[-1][1], y, size, f)
    if y == BOLD_STOP and page == 1:
        cx = x
        for code, name, w in gl:
            put_glyphs(page, [(code, name, w)], cx, y, size, 'F2' if name == '.' else f); cx += w
        return x, x + width
    put_glyphs(page, gl, x, y, size, f)
    return x, x + width

# the highlight first, under its line (a fill drawn after the text would hide it)
for y, size, text, align in LINES1:
    if y == HIGHLIGHT:
        w = sum(a for _, _, a in layout(text, size))
        ops[1].append('1 1 0 rg %.2f %.2f %.2f %.2f re f 0 g' % (R - w - 1, y - 3.5, w + 2, size + 2))
for y, size, text, align in LINES1: line(1, text, y, size, align, 'F2' if y in BOLD else 'F1')
# the running head and foot, framed, on both pages
for p in (1, 2):
    line(p, HEAD, 812, 10, 'c')
    hw = sum(a for _, _, a in layout(HEAD, 10))
    for x in (297.6 - hw / 2 - 20, 297.6 + hw / 2 + 20): ops[p].append('0.75 w %.2f 790 m %.2f 828 l S' % (x, x))
    ops[p].append('0.75 w 60 790 m 535 790 l S')
    put_glyphs(p, layout('صفحه %d از 2' % p, 9), 60, 30, 9)
    ops[p].append('0.75 w 130 25 m 130 45 l S 0.75 w 60 45 m 535 45 l S')
    fw = sum(a for _, _, a in layout(FOOT, 9)); put_glyphs(p, layout(FOOT, 9), 525 - fw, 30, 9)
# the bullets: the text flush right at R − 27, the bullet at R − 8 (a tab between them)
for y, text in BULLETS:
    gl = layout(text, 12); w = sum(a for _, _, a in gl)
    put_glyphs(1, gl, R - 27 - w, y, 12)
    put_glyphs(1, [(0x2022, '•', FONTS['F1'].adv(0x2022, 12))], R - 8, y, 12)
# the second level: its text flush right at R − 45, Word's Courier «o» at R − 30
gl = layout(SUB[1], 12); w = sum(a for _, _, a in gl)
put_glyphs(1, gl, R - 45 - w, SUB[0], 12)
put_glyphs(1, [(ord('o'), 'o', FONTS['F3'].adv(ord('o'), 12))], R - 30, SUB[0], 12, 'F3')
# the signature at the far side, after the list: two bold lines centred on one x (its lines had joined, and the
# paragraph had gone into the list's last item)
for y, t in SIGN:
    gl = layout(t, 11, 'F2'); w = sum(a for _, _, a in gl)
    put_glyphs(1, gl, 150 - w / 2, y, 11, 'F2')
# the 1-pt code in the letterhead
put_glyphs(1, layout(TINY[3], TINY[2]), TINY[0], TINY[1], TINY[2])

# page 2: the table (right to left: ردیف | عنوان | نفرساعت from the right)
XS = [100, 250, 485, 525]                       # column edges, left to right
rule = lambda page, x0, y0, x1, y1: ops[page].append('0.75 w %.2f %.2f m %.2f %.2f l S' % (x0, y0, x1, y1))
ops[2].append('0.9 g 100 740 425 20 re f 0 g')            # the title cell, shaded (Excel's)
rule(2, 100, 760, 525, 760); rule(2, 100, 740, 525, 740); rule(2, 100, 760, 100, 740); rule(2, 525, 760, 525, 740)
for y in (720, 700): rule(2, 100, y, 525, y)
rule(2, 100, 680, 485, 680)                     # the last row's bottom rule: not under the first column
for x in XS: rule(2, x, 680, x, 740)
for x0, y0, x1, y1 in ((100, 660, 250, 680),):  # the total, boxed on its own under the table
    rule(2, x0, y0, x1, y0); rule(2, x0, y1, x1, y1); rule(2, x0, y0, x0, y1); rule(2, x1, y0, x1, y1)
def cell(text, c, y):
    gl = layout(text, 11); w = sum(a for _, _, a in gl)
    put_glyphs(2, gl, XS[c + 1] - 5 - w, y, 11)
gl = layout('فهرست توسعه‌ها', 12); put_glyphs(2, gl, 520 - sum(a for _, _, a in gl), 745, 12)
rows = [(725, ('ردیف', 'عنوان', 'نفرساعت')), (705, ('1', 'دستیار پاسخگو', '100')), (685, ('2', 'عامل خزنده', '300')), (665, ('', '', '400'))]
for y, cells in rows:
    for c, t in zip((2, 1, 0), cells):
        if t: cell(t, c, y)

# page 2, table B: a header row ruled, then one band — no rules between its items (x 200..525: شرح | مبلغ)
# «بسمه تعالی»: drawn in logical order (right to left), each glyph on its own height, each twice (fake bold)
gl = layout(BISM[2], BISM[1], 'F4'); w = sum(a for _, _, a in gl)
xs, cx = [], 297.6 - w / 2
for code, name, a in gl: xs.append((code, name, a, cx)); cx += a
for k, (code, name, a, gx) in enumerate(reversed(xs)):
    for dx in (0, 0.32): put_glyphs(1, [(code, name, a)], gx + dx, BISM[0] + BISM[3][k], BISM[1], 'F4')
# «صلوات بر محمد و آل محمد»: each word placed where it stands, drawn in another order, the last one raised
words = SALAVAT[2].split(' ')
gl_all = layout(SALAVAT[2], SALAVAT[1], 'F4'); w_all = sum(a for _, _, a in gl_all)
spw = FONTS['F4'].adv(0x20, SALAVAT[1])
right, places = 297.6 + w_all / 2, []
for k, wd in enumerate(words):                      # right to left: each word's visual glyphs and its left edge
    g = layout(wd, SALAVAT[1], 'F4'); ww = sum(a for _, _, a in g)
    places.append((g, right - ww)); right -= ww + spw
for k in SALAVAT[3]:
    g, x0 = places[k]
    put_glyphs(1, g, x0, SALAVAT[0] + (SALAVAT[4] if k == len(words) - 1 else 0), SALAVAT[1], 'F4')
    put_glyphs(1, [(0x20, ' ', spw)], x0 - spw, SALAVAT[0], SALAVAT[1], 'F4')
# page 2, under table C: the copy list and the number between gaps
line(2, 'رونوشت:', 300, 11, 'r')
line(2, '-معاون محترم نمونه، جهت استحضار', 282, 11, 'r')
gl = layout('مدیر محترم نمونه، جهت اطلاع', 11); w = sum(a for _, _, a in gl)
put_glyphs(2, gl, R - 9 - w, 264, 11)                       # its dash 3 pt off, a run of its own
put_glyphs(2, [(ord('-'), '-', FONTS['F1'].adv(ord('-'), 11))], R - 9 + 3, 264, 11)
xg = R
for k, seg in enumerate(['مهلت پاسخ حداکثر', '3', 'روز است.']):
    gl = layout(seg, 11); w = sum(a for _, _, a in gl); xg -= w
    put_glyphs(2, gl, xg, 240, 11); xg -= 0.25 * 11
TB = [200, 330, 525]
for x in TB: rule(2, x, 470, x, 620)
for y in (620, 600, 470): rule(2, 200, y, 525, y)
cellB = lambda text, c, y: put_glyphs(2, layout(text, 11), TB[c + 1] - 5 - sum(a for _, _, a in layout(text, 11)), y, 11)
cellB('شرح', 1, 605); cellB('مبلغ', 0, 605)
for k, (lab, amt) in enumerate(PAY):
    cellB(lab, 1, 585 - 22 * k); cellB(amt, 0, 585 - 22 * k)
# table C: cells whose text wraps over full lines (x 150..525: شرح | طرح)
TC = [150, 445, 525]
for x in TC: rule(2, x, 330, x, 440)
for y in (440, 420, 330): rule(2, 150, y, 525, y)
cellC = lambda text, c, y: put_glyphs(2, layout(text, 11), TC[c + 1] - 5 - sum(a for _, _, a in layout(text, 11)), y, 11)
cellC('طرح', 1, 425); cellC('شرح', 0, 425); cellC('زائریار', 1, 405)
for k, t in enumerate(WRAP): cellC(t, 0, 405 - 22 * k)

# ── the PDF ────────────────────────────────────────────────────────────
objs = []
def obj(body): objs.append(body); return len(objs)
def stream(data, extra=''):
    z = zlib.compress(data)
    return b'<< /Length %d /Filter /FlateDecode %s >>\nstream\n' % (len(z), extra.encode()) + z + b'\nendstream'
def u16(s): return ''.join('%04X' % (ord(c)) for c in s)
fontref = {}
for k, F in FONTS.items():
    ff = obj(stream(F.bytes, '/Length1 %d' % len(F.bytes)))
    bb = F.font['head']
    # (in 1000 units, as Word writes it — the font's own units are 2048)
    box = TALL.get(k) or tuple(round(v * 1000 / F.upem) for v in (bb.xMin, bb.yMin, bb.xMax, bb.yMax))
    desc = obj(('<< /Type /FontDescriptor /FontName /%s /Flags 32 /FontBBox [%d %d %d %d] /ItalicAngle 0 '
                '/Ascent 928 /Descent -236 /CapHeight 729 /StemV %d /FontFile2 %d 0 R >>' % ((F.ps,) + box + (140 if k == 'F2' else 80, ff))).encode())
    widths = ' '.join('%d [%d]' % (g, round(F.font['hmtx'][F.font.getGlyphName(g)][0] * 1000 / F.upem)) for g in sorted(F.tounicode))
    cid = obj(('<< /Type /Font /Subtype /CIDFontType2 /BaseFont /%s /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> '
               '/FontDescriptor %d 0 R /CIDToGIDMap /Identity /W [%s] >>' % (F.ps, desc, widths)).encode())
    cm = ('/CIDInit /ProcSet findresource begin 12 dict begin begincmap /CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def '
          '/CMapName /Adobe-Identity-UCS def /CMapType 2 def 1 begincodespacerange <0000> <FFFF> endcodespacerange\n%d beginbfchar\n%s\nendbfchar\n'
          'endcmap CMapName currentdict /CMap defineresource pop end end') % (len(F.tounicode), '\n'.join('<%04X> <%s>' % (g, u16(t)) for g, t in sorted(F.tounicode.items())))
    tu = obj(stream(cm.encode()))
    fontref[k] = obj(('<< /Type /Font /Subtype /Type0 /BaseFont /%s /Encoding /Identity-H /DescendantFonts [%d 0 R] /ToUnicode %d 0 R >>' % (F.ps, cid, tu)).encode())
pages_id = len(objs) + 2 * 2 + 1
kids = []
res = ' '.join('/%s %d 0 R' % (k, v) for k, v in fontref.items())
for p in (1, 2):
    c = obj(stream('\n'.join(ops[p]).encode()))
    kids.append(obj(('<< /Type /Page /Parent %d 0 R /MediaBox [0 0 595.32 841.92] /Resources << /Font << %s >> >> /Contents %d 0 R >>' % (pages_id, res, c)).encode()))
assert obj(('<< /Type /Pages /Kids [%s] /Count 2 >>' % ' '.join('%d 0 R' % k for k in kids)).encode()) == pages_id
cat = obj(('<< /Type /Catalog /Pages %d 0 R /Lang (fa-IR) >>' % pages_id).encode())
info = obj(b'<< /Producer (Microsoft\xae Word LTSC) /Creator (Microsoft\xae Word LTSC) /Title (word-rtl) >>')
out = io.BytesIO(); out.write(b'%PDF-1.7\n%\xe2\xe3\xcf\xd3\n'); offs = []
for i, b in enumerate(objs):
    offs.append(out.tell()); out.write(b'%d 0 obj\n' % (i + 1) + b + b'\nendobj\n')
x = out.tell()
out.write(b'xref\n0 %d\n0000000000 65535 f \n' % (len(objs) + 1) + b''.join(b'%010d 00000 n \n' % o for o in offs))
out.write(b'trailer\n<< /Size %d /Root %d 0 R /Info %d 0 R >>\nstartxref\n%d\n%%%%EOF\n' % (len(objs) + 1, cat, info, x))
open(os.path.join(LAB, 'pdf', 'producers', 'word-print--word-rtl.pdf'), 'wb').write(out.getvalue())
open(os.path.join(LAB, 'corpus', 'word-rtl.md'), 'w').write(EXPECTED)
print('pdf/word-print--word-rtl.pdf', len(out.getvalue()), 'bytes; widths:', ', '.join('%.0f' % sum(a for _, _, a in layout(t, s)) for _, s, t, _ in LINES1))
