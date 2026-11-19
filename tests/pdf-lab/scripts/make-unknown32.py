# Kelk 3.2's fonts Kelk does not know, glyph by glyph (rtl_pdf2.py's Renum; text of our own). Each page is set in a
# print driver's renumbered font — one-byte codes numbered from 33 in the order the glyphs are first used, a (1,0) cmap
# only, no glyph names, no /ToUnicode — so only the outlines say which letter a code is:
#   · driver-print--unknown-serif-fa: a Persian page in FreeSerif (GNU FreeFont), a typeface Kelk does not ship and
#     has no fontprints of: its letters can be known only by their shapes against the fonts Kelk ships;
#   · driver-print--unknown-serif-en: the same for an English page in Liberation Serif;
#   · driver-print--unreadable-fa: a Persian page whose glyphs are drawn as abstract boxes (FreeSerif's advances, each
#     glyph's outline replaced by bars made from its glyph id): no reading can recover it. It must always be reported
#     garbled (the owner's rule, 2026-11-18), whatever Kelk learns to read.
# Until Kelk reads fonts it does not know (TODO.md, 3.2) all three are reported garbled and their text is unread.
# IMITATED: we cannot run a print driver here; the files follow what such files hold.
#   python3 scripts/make-unknown32.py   → pdf/producers/driver-print--unknown-serif-fa.pdf, --unknown-serif-en.pdf,
#                                         --unreadable-fa.pdf and their corpus files
# Fonts: FreeSerif from GNU FreeFont (FREEFONT=<folder>, else the Linux folders) and Liberation Serif (LIBERATION=…);
# both licences allow embedding a subset in a document.
import io, os, sys
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rtl_pdf
from fontTools.ttLib import TTFont
from fontTools.pens.ttGlyphPen import TTGlyphPen
from rtl_pdf import Font, LAB
from rtl_pdf2 import Doc2, Renum

def find(env, dirs, name):
    for d in [os.environ.get(env)] + dirs:
        if d and os.path.isfile(os.path.join(d, name)): return os.path.join(d, name)
    raise SystemExit(name + ' not found: install it, or set ' + env + ' to the folder that holds it')
FREE = ['/usr/share/fonts/truetype/freefont', '/usr/share/fonts/gnu-free', '/usr/share/fonts/TTF']
LIB = ['/usr/share/fonts/truetype/liberation', '/usr/share/fonts/truetype/liberation2', '/usr/share/fonts/liberation', '/usr/share/fonts/TTF']
SERIF, SERIF_B = find('FREEFONT', FREE, 'FreeSerif.ttf'), find('FREEFONT', FREE, 'FreeSerifBold.ttf')
LSERIF, LSERIF_B = find('LIBERATION', LIB, 'LiberationSerif-Regular.ttf'), find('LIBERATION', LIB, 'LiberationSerif-Bold.ttf')

PRODUCER = b'Lab print driver'
def out(name): return os.path.join(LAB, 'pdf', 'producers', name)
def corpus(name, text): open(os.path.join(LAB, 'corpus', name), 'w', encoding='utf8').write(text); print('corpus/' + name)
R, L0, M = 530, 65, 465

def persian(fonts, title, paras, path, doc):
    C = Doc2(fonts)
    C.line(1, title, 770, 18, 0, 'T', center=C.w / 2)
    y = 730
    for p in paras: y = C.para(1, p, y, 12, R, M, 'F', lead=1.7) - 10
    C.write(out(path), PRODUCER, doc)
    corpus(doc + '.md', '# %s\n\n%s\n' % (title, '\n\n'.join(paras)))

def abstract(F):
    """F's glyphs drawn as bars made from each glyph's id (advances kept): shapes no font has"""
    t = TTFont(io.BytesIO(F.bytes)); glyf = t['glyf']; upem = t['head'].unitsPerEm
    for gid, name in enumerate(t.getGlyphOrder()):
        if name == '.notdef' or glyf[name].numberOfContours == 0: continue
        adv = t['hmtx'][name][0]; pen = TTGlyphPen(None); h = (gid * 2654435761) & 0xFFFFFFFF
        for k in range(1 + h % 3):                       # one to three bars, their places and heights from the id
            bits = (h >> (5 * k)) & 31
            x0 = round(adv * (0.1 + 0.25 * (bits % 3))); x1 = x0 + round(adv * 0.18) + 10
            y0 = round(upem * (-0.1 + 0.15 * (bits % 4))); y1 = y0 + round(upem * (0.2 + 0.1 * (bits % 5)))
            pen.moveTo((x0, y0)); pen.lineTo((x0, y1)); pen.lineTo((x1, y1)); pen.lineTo((x1, y0)); pen.closePath()
        glyf[name] = pen.glyph()
    buf = io.BytesIO(); t.save(buf); F.bytes = buf.getvalue(); F.font = TTFont(io.BytesIO(F.bytes))
    return F

# ---- 1. Persian in a typeface Kelk does not ship ----------------------------------------------------------------------
FA1 = ('باغ محله', [
    'ساکنان کوچه ما سال گذشته زمین خالی کنار مدرسه را به باغی کوچک تبدیل کردند. هر خانواده یک باغچه گرفت و در آن سبزی، '
    'گوجه و گل کاشت. آب باغ از چاه قدیمی محله می‌آید و هر روز صبح یکی از همسایه‌ها نوبت آبیاری را بر عهده دارد.',
    'بچه‌های مدرسه هفته‌ای یک بار به باغ می‌آیند و با کمک معلم خود نام گیاهان را یاد می‌گیرند. آن‌ها برای هر باغچه '
    'تابلوی کوچکی ساخته‌اند و روی آن نوشته‌اند چه چیزی در آن کاشته شده و چه زمانی برداشت می‌شود.',
    'در پایان تابستان جشنی برگزار شد و همسایه‌ها محصول باغچه‌های خود را با هم تقسیم کردند. قرار است سال آینده چند '
    'درخت میوه هم کاشته شود و یک نیمکت چوبی برای سالمندان محله کنار در باغ گذاشته شود.'])
persian({'T': Renum(Font(SERIF_B, 'AAAAAA+DemoSerif,Bold')), 'F': Renum(Font(SERIF, 'AAAAAB+DemoSerif'))},
        FA1[0], FA1[1], 'driver-print--unknown-serif-fa.pdf', 'unknown-serif-fa')

# ---- 2. English in a typeface Kelk does not ship ----------------------------------------------------------------------
rtl_pdf.CODES |= {ord(c) for c in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ,\'!?'}
EN_T = 'The street orchestra'
EN = ['Every Friday evening a small orchestra plays in the square by the old market. It began with three friends and '
      'a borrowed drum, and now it has more than thirty players, from children who have just learned their first notes '
      'to grandparents who played in bands when they were young.',
      'The players meet on Wednesdays in the back room of the bakery to practise. Anyone may join: the orchestra lends '
      'instruments to those who have none, and two music teachers give their time to help the beginners.',
      'In the summer the orchestra plans to visit the villages along the river. The money for the bus comes from a '
      'jar at the edge of the square, where listeners leave what they can after each concert.']
C = Doc2({'T': Renum(Font(LSERIF_B, 'AAAAAC+DemoBook,Bold')), 'F': Renum(Font(LSERIF, 'AAAAAD+DemoBook'))}, lang='en-US')
C.line(1, EN_T, 770, 18, 0, 'T', ltr=True, center=C.w / 2)
y = 730
for p in EN:
    cur = ''
    for w in p.split(' ') + [None]:
        t = (cur + ' ' + w).strip() if w is not None else None
        if t is None or C.width([(ord(c), c) for c in t], 12, 'F') > M:
            C.put(1, [(ord(c), c) for c in cur], L0, y, 12, 'F'); y -= 18; cur = w or ''
        else: cur = t
    y -= 10
C.write(out('driver-print--unknown-serif-en.pdf'), PRODUCER, 'unknown-serif-en')
corpus('unknown-serif-en.md', '# %s\n\n%s\n' % (EN_T, '\n\n'.join(EN)))

# ---- 3. Persian no reading can recover ------------------------------------------------------------------------------
FA3 = ('کارگاه نجاری', [
    'کارگاه نجاری محله هر پنجشنبه از ساعت چهار تا هفت عصر باز است. کسانی که می‌خواهند وسیله‌ای چوبی بسازند یا میز و '
    'صندلی کهنه خود را تعمیر کنند می‌توانند با ابزار کارگاه کار کنند و از تجربه استادکاران بهره ببرند.',
    'برای هر نفر یک میز کار و یک جعبه ابزار در نظر گرفته شده است. چوب را هر کس خود می‌آورد، اما کارگاه تکه‌های باقی‌مانده '
    'از کارهای دیگر را رایگان در اختیار نوآموزان می‌گذارد تا با آن‌ها تمرین کنند.',
    'رعایت نکات ایمنی در کارگاه الزامی است. پوشیدن عینک و دستکش هنگام کار با اره برقی واجب است و کودکان فقط همراه '
    'یکی از والدین می‌توانند وارد کارگاه شوند.'])
persian({'T': Renum(abstract(Font(SERIF_B, 'AAAAAE+DemoBars,Bold'))), 'F': Renum(abstract(Font(SERIF, 'AAAAAF+DemoBars')))},
        FA3[0], FA3[1], 'driver-print--unreadable-fa.pdf', 'unreadable-fa')
