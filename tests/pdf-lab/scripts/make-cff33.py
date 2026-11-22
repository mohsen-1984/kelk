# Kelk 3.3's font cases (text of our own), each page built glyph by glyph:
#   · distiller-cff--cff-cid-fa: a Persian page as Acrobat Distiller writes it from a PostScript driver — the Persian
#     glyphs in a CID-keyed CFF program (FontFile3 /CIDFontType0C, Identity-H, ROS Adobe-Identity-0, one Font DICT, no
#     subroutines, no glyph names, no /ToUnicode), its CIDs the source font's glyph ids (so a CID is not a glyph id:
#     only the program's charset maps one to the other), /W widths; the space, the digits and the ASCII marks in a
#     second, plain CFF subset (/Type1C) whose glyphs carry their standard names (space, zero, slash, colon).
#     FreeSerif: a typeface Kelk does not ship, so only the outlines can tell the Persian letters;
#   · distiller-cff--cff-type1c-fa: a Persian page in a renumbered plain CFF subset (/Type1C, one-byte codes from 33
#     in order of first use, glyph names that say nothing, no /ToUnicode), its outlines in 2048 units an em (FontMatrix
#     1/2048) and drawn through nested local and global subroutines. FreeSerif again;
#   · distiller-cff--cff-known-fa: the same habits in Vazirmatn (a face Kelk ships), its program turned into CFF —
#     cubic outlines in 1000 units an em, so no TrueType fontprint matches; its glyphs' advances and contour boxes
#     still can;
#   · prince-cff--cff-zwnj-fa: shapes-fa's case (make-shapes-rtl.py) in plain CFF subsets of DejaVu Sans — codes
#     shuffled, no glyph names, a /ToUnicode naming base letters, no ZWNJ drawn, 1000 units an em; the bold face only
#     for two lines with ZWNJ words, too rare to learn its forms by use;
#   · distiller-cff--cff-unreadable-fa: a Persian page in a renumbered plain CFF subset whose glyphs are abstract bars
#     (make-unknown32.py's unreadable-fa in CFF): no reading can recover it, so it must always be reported garbled;
#   · word-save--teh-fa: Word's «Save as PDF» habit with ت — the font's ToUnicode names every form of ت «"» (U+0022)
#     while the program's cmap names them right; a Latin word in real quotes in the same font;
#   · word-save--tatweel-fa: a calligraphic font's ToUnicode that names some final forms as tatweels plus the letter
#     («ـــی»), as a Nastaliq font writes its stretched forms; the program's cmap names them right.
# IMITATED: we cannot run Distiller or Word here; the files follow what such files hold.
#   python3 scripts/make-cff33.py   → pdf/producers/<the six files>.pdf and their corpus files
# Fonts: FreeSerif from GNU FreeFont (FREEFONT=<folder>, else the Linux folders), DejaVu Sans (DEJAVU=…) and Vazirmatn
# from assets/fonts/download/persian-fonts-ttf.zip. The text of these files stays out of letterstats.js (MEASURED in
# tools/build-letterstats.js). Lab files carry no personal metadata: Producer, Creator and Title only.
import io, os, sys, zipfile
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rtl_pdf
from rtl_pdf import LAB, REG, BOLD, visual
from rtl_pdf2 import Doc2, brackets

def find(env, dirs, name):
    for d in [os.environ.get(env)] + dirs:
        if d and os.path.isfile(os.path.join(d, name)): return os.path.join(d, name)
    raise SystemExit(name + ' not found: install it, or set ' + env + ' to the folder that holds it')
FREE = ['/usr/share/fonts/truetype/freefont', '/usr/share/fonts/gnu-free', '/usr/share/fonts/TTF']
SERIF, SERIF_B = find('FREEFONT', FREE, 'FreeSerif.ttf'), find('FREEFONT', FREE, 'FreeSerifBold.ttf')
ZIP = os.path.join(LAB, '..', '..', 'assets', 'fonts', 'download', 'persian-fonts-ttf.zip')
def zipped(name): return io.BytesIO(zipfile.ZipFile(ZIP).read(name))
def out(name): return os.path.join(LAB, 'pdf', 'producers', name)
def corpus(name, text): open(os.path.join(LAB, 'corpus', name), 'w', encoding='utf8').write(text); print('corpus/' + name)

from rtl_cff import STD, CffFace, Doc3, cff_program, bars

DISTILLER = b'Acrobat Distiller 9.0 (Windows)'
WORD = b'Microsoft\xae Word LTSC'
R, M = 530, 465
def page(doc, title, paras, tpick, pick, size=12):
    doc.line(1, title, 770, 18, 0, tpick, center=doc.w / 2)
    y = 730
    for p in paras: y = doc.para(1, p, y, size, R, M, pick) - 10
def md(title, paras): return '# %s\n\n%s\n' % (title, '\n\n'.join(paras))

# ---- 1. CID-keyed CFF, the ASCII marks in a plain subset with standard names ------------------------------------------
FA1 = ('گزارش سالانه کتابخانه محله', [
    'کتابخانه محله در سال 1402 بیش از 3200 عضو تازه پذیرفت و شمار کتاب‌های امانت داده شده به حدود 18500 جلد رسید. بیشتر '
    'اعضای تازه دانش‌آموزان مدرسه‌های نزدیک بودند که برای کارهای پژوهشی خود به کتابخانه می‌آمدند.',
    'تالار مطالعه از ساعت 8:30 صبح تا 9 شب باز است و در روزهای امتحان تا نیمه‌شب باز می‌ماند. در این سال 45 درصد از بودجه '
    'کتابخانه صرف خرید کتاب‌های تازه شد و بقیه آن برای تعمیر قفسه‌ها و خرید رایانه به کار رفت.',
    'جشن کتابخوانی امسال در تاریخ 1402/09/24 برگزار شد. در این جشن به ده عضو که بیشترین کتاب را خوانده بودند جایزه داده شد '
    'و نویسندگان محلی درباره کارهای خود سخن گفتند.'])
F = {'T': CffFace(SERIF_B, 'GLABAA+DemoSerifBoldPS', kind='cid'), 'F': CffFace(SERIF, 'GLABAB+DemoSerifPS', kind='cid'),
     'A': CffFace(SERIF, 'GLABAC+DemoSerifPS', coding='ascii', names='std')}
D = Doc3(F)
asc = lambda c: c < 0x80
page(D, FA1[0], FA1[1], lambda c: 'A' if asc(c) else 'T', lambda c: 'A' if asc(c) else 'F')
D.write(out('distiller-cff--cff-cid-fa.pdf'), DISTILLER, 'cff-cid-fa')
corpus('cff-cid-fa.md', md(*FA1))

# ---- 2. a renumbered plain CFF subset: 2048 units an em, nested subroutines --------------------------------------------
FA2 = ('سفر به روستای کوهستانی', [
    'گروه کوه‌نوردی دانشکده در آغاز پاییز به روستایی کوچک در دامنه کوه رفت. راه روستا از میان باغ‌های گردو و سیب می‌گذرد و '
    'در کنار آن رودی باریک جاری است که آب آن از چشمه‌های بالای کوه می‌آید.',
    'مردم روستا با مهربانی از گروه پذیرایی کردند و شب را در خانه قدیمی دهیار گذراندیم. پیرمردی از اهالی برای ما از '
    'زمستان‌های سخت گذشته گفت و از روزهایی که برف راه روستا را چند هفته می‌بست.',
    'صبح روز بعد به قله رسیدیم و از آنجا دشت پهناور و روستاهای دور را دیدیم. هنگام بازگشت قرار گذاشتیم که در بهار برای '
    'کمک به کاشت درخت در زمین‌های روستا دوباره به آنجا برویم.'])
F = {'T': CffFace(SERIF_B, 'GLABAD+DemoSerifBold', units=2048, subrs=True), 'F': CffFace(SERIF, 'GLABAE+DemoSerif', units=2048, subrs=True)}
D = Doc3(F)
page(D, FA2[0], FA2[1], lambda c: 'T', lambda c: 'F')
D.write(out('distiller-cff--cff-type1c-fa.pdf'), DISTILLER, 'cff-type1c-fa')
corpus('cff-type1c-fa.md', md(*FA2))

# ---- 3. a face Kelk ships, as CFF ---------------------------------------------------------------------------------------
FA3 = ('باشگاه ورزشی محله', [
    'باشگاه ورزشی محله پس از دو سال بازسازی دوباره باز شد. سالن آن اکنون کفپوش تازه دارد و برای بازی والیبال و بسکتبال '
    'آماده است. در کنار سالن اتاقی برای تمرین شطرنج و تنیس روی میز ساخته شده است.',
    'باشگاه برای کودکان کلاس‌های شنا و ژیمناستیک برگزار می‌کند و مربیان آن همه دوره‌های آموزشی لازم را گذرانده‌اند. '
    'بزرگسالان می‌توانند صبح‌ها پیش از رفتن به کار از سالن بدنسازی استفاده کنند.',
    'هزینه عضویت برای ساکنان محله کمتر است و خانواده‌هایی که چند عضو دارند تخفیف می‌گیرند. باشگاه از همسایه‌ها خواسته است '
    'پیشنهادهای خود را برای برنامه‌های تابستان به دفتر آن بدهند.'])
F = {'T': CffFace(zipped('vazirmatn/Vazirmatn-Bold.ttf'), 'GLABAF+DemoSansBold', units=1000),
     'F': CffFace(zipped('vazirmatn/Vazirmatn-Regular.ttf'), 'GLABAG+DemoSans', units=1000)}
D = Doc3(F)
page(D, FA3[0], FA3[1], lambda c: 'T', lambda c: 'F')
D.write(out('distiller-cff--cff-known-fa.pdf'), DISTILLER, 'cff-known-fa')
corpus('cff-known-fa.md', md(*FA3))

# ---- 3b. a CFF font no reading can recover --------------------------------------------------------------------------------
FA3B = ('کارگاه سفالگری', [
    'کارگاه سفالگری فرهنگسرا هر دوشنبه و چهارشنبه از ساعت پنج تا هشت عصر باز است. هنرجویان در این کارگاه ساختن کاسه و '
    'گلدان را با چرخ سفالگری یاد می‌گیرند و کارهای خود را در کوره کارگاه می‌پزند.',
    'استاد کارگاه سال‌ها در روستاهای سفالگر کار کرده است و روش‌های کهن رنگ‌آمیزی را به هنرجویان می‌آموزد. در پایان هر دوره '
    'نمایشگاهی کوچک از کارهای هنرجویان در تالار فرهنگسرا برپا می‌شود.'])
F = {'T': CffFace(SERIF_B, 'GLABAH+DemoBarsBold', bars=True), 'F': CffFace(SERIF, 'GLABAI+DemoBars', bars=True)}
D = Doc3(F)
page(D, FA3B[0], FA3B[1], lambda c: 'T', lambda c: 'F')
D.write(out('distiller-cff--cff-unreadable-fa.pdf'), DISTILLER, 'cff-unreadable-fa')
corpus('cff-unreadable-fa.md', md(*FA3B))

# ---- 4. ZWNJ by outline, in CFF ------------------------------------------------------------------------------------------
SUBJECT = 'موضوع: برنامه‌های تازه کلاس‌ها'
HEAD2 = 'کلاس‌های پیشنهادی این ترم'
PARA1 = ['با سلام، به آگاهی می‌رساند که برنامه کلاس‌های این ترم در نشست هفته گذشته بررسی شد',
         'و همه گروه‌ها نظر خود را درباره درس‌های تازه و ساعت‌های آن‌ها اعلام کردند. شورای آموزشی',
         'پیشنهاد کرد که کلاس‌ها در دو نوبت برگزار شود و هر نوبت با آزمونی کوتاه به پایان برسد.']
PARA2 = ['در نوبت نخست، درس‌های پایه و کارگاه‌های نوشتن برگزار می‌شود و در نوبت دوم، دانشجویان',
         'می‌توانند درس‌های اختیاری خود را برگزینند. نتیجه هر نوبت به همه گروه‌ها اعلام می‌شود.']
F = {'F1': CffFace(REG, 'PXAAAE+DemoSans', coding='shuffle', tounicode=True, seed=7, units=1000),
     'F2': CffFace(BOLD, 'PXAAAF+DemoSans-Bold', coding='shuffle', tounicode=True, seed=11, units=1000)}
F['F1'].prepare(PARA1 + PARA2); F['F2'].prepare([SUBJECT, HEAD2])
D = Doc3(F)
D.line(1, SUBJECT, 760, 12, 540, lambda c: 'F2')
for k, t in enumerate(PARA1): D.line(1, t, 730 - 18 * k, 12, 540, lambda c: 'F1')
D.line(1, HEAD2, 660, 12, 540, lambda c: 'F2')
for k, t in enumerate(PARA2): D.line(1, t, 636 - 18 * k, 12, 540, lambda c: 'F1')
D.write(out('prince-cff--cff-zwnj-fa.pdf'), b'Prince 15.1 (www.princexml.com)', 'cff-zwnj-fa')
corpus('cff-zwnj-fa.md', '**%s**\n\n%s\n\n**%s**\n\n%s\n' % (SUBJECT, ' '.join(PARA1), HEAD2, ' '.join(PARA2)))

# ---- 5. Word's ت named «"» -----------------------------------------------------------------------------------------------
rtl_pdf.CODES |= {ord(c) for c in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"'}
TEH = [0xFE95, 0xFE96, 0xFE97, 0xFE98]
FA5 = ('تاریخچه انتشارات دانشگاه', [
    'انتشارات دانشگاه نخستین کتاب خود را سال‌ها پیش با دست چاپ کرد. در آن زمان تنها یک دستگاه چاپ قدیمی در اختیار داشت و '
    'هر کتاب چند ماه طول می‌کشید تا آماده شود. امروز انتشارات هر سال ده‌ها کتاب درسی و پژوهشی منتشر می‌کند.',
    'تازه‌ترین طرح انتشارات "Ketabnama" نام دارد. در این طرح متن کامل کتاب‌های قدیمی دانشگاه با دقت بازخوانی می‌شود تا '
    'همه پژوهشگران بتوانند آن‌ها را به آسانی بخوانند و در آن‌ها جستجو کنند.',
    'دبیر انتشارات گفت که هدف آن‌ها نگهداری از میراث نوشتاری دانشگاه است. به گفته او تا پایان امسال متن هشتاد کتاب آماده '
    'خواهد شد و پس از آن نوبت به نشریه‌ها و مقاله‌های قدیمی می‌رسد.'])
T, B = rtl_pdf.Font(SERIF, 'AAAAAG+DemoSerif'), rtl_pdf.Font(SERIF_B, 'AAAAAH+DemoSerif-Bold')
for f in (T, B):
    for c in TEH: f.tounicode[f.gid(c)] = '"'
C = Doc2({'T': B, 'F': T})
C.line(1, FA5[0], 770, 18, 0, 'T', center=C.w / 2)
y = 730
for p in FA5[1]: y = C.para(1, p, y, 12, R, M, 'F', lead=1.7) - 10
C.write(out('word-save--teh-fa.pdf'), WORD, 'teh-fa')
corpus('teh-fa.md', md(*FA5))

# ---- 6. a ToUnicode of tatweels plus the letter ---------------------------------------------------------------------------
STRETCH = {0xFBFD: 'ی', 0xFEE6: 'ن', 0xFB8F: 'ک', 0xFB93: 'گ'}       # final forms, written «ـــ» + the letter
FA6 = ('یادداشت‌های سفر', [
    'این یادداشت‌ها را در سفری کوتاه به شهری کهن نوشتم. در نخستین روز به دیدن بازار سنگی رفتم که هنوز مانند گذشته پر از '
    'دکان‌های کوچک است. فروشندگان با خوشرویی از کالاهای خود سخن می‌گفتند و برای هر پرسش پاسخی داشتند.',
    'روز دوم را در کتابخانه قدیمی شهر گذراندم. کتابدار پیر آن سال‌ها از کتاب‌ها نگهداری کرده بود و نام بیشتر نویسندگان را '
    'به یاد داشت. او نسخه‌ای کهن از دیوان شاعری را نشانم داد که برگ‌های آن رنگ باخته بود.',
    'در راه بازگشت از کنار باغی بزرگ گذشتم که درختان آن در آستانه پاییز رنگارنگ شده بودند. این سفر کوتاه نشانم داد که '
    'هر شهر کهن داستانی دارد که تنها با آهسته رفتن و گوش دادن شنیده می‌شود.'])
T, B = rtl_pdf.Font(SERIF, 'AAAAAI+DemoNastaliq'), rtl_pdf.Font(SERIF_B, 'AAAAAJ+DemoNastaliq-Bold')
for f in (T, B):
    for c, l in STRETCH.items(): f.tounicode[f.gid(c)] = 'ـــ' + l
C = Doc2({'T': B, 'F': T})
C.line(1, FA6[0], 770, 18, 0, 'T', center=C.w / 2)
y = 730
for p in FA6[1]: y = C.para(1, p, y, 12, R, M, 'F', lead=1.7) - 10
C.write(out('word-save--tatweel-fa.pdf'), WORD, 'tatweel-fa')
corpus('tatweel-fa.md', md(*FA6))
