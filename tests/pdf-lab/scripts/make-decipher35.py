# Kelk 3.5's lab files: Persian in fonts Kelk does not know, for the decipherment of such fonts (TODO.md, 3.5) — text of
# our own, written for these files (so in no text tools/lm/lm.json counted), each page built glyph by glyph. Every font
# is a typeface Kelk neither ships, fingerprints (lib/pdfimport/fontprints.js) nor has shapes of (lib/pdfimport/
# shapes.js holds DejaVu Sans's Latin glyphs only, none of its Arabic ones), nor calibrates the feature model on
# (tools/build-featmodel.js): DejaVu Sans Book and FreeSerif (GNU FreeFont). No file names its letters: a print
# driver's renumbered TrueType font (rtl_pdf2.py's Renum: one-byte codes from 33 in order of first use, no glyph names,
# no /ToUnicode) or Distiller's CID-keyed CFF program (rtl_cff.py), unless the file says otherwise below:
#   · driver-print--decipher-body-fa: two pages of body text, a title (DejaVu Sans);
#   · distiller-cff--decipher-cid-fa: a page in CID-keyed CFF programs, its CIDs the source's glyph ids (FreeSerif);
#   · driver-print--decipher-subsets-fa: six short pages, each in a subset of its own of one font (FreeSerif): each
#     subset alone has little text, together they are one font;
#   · driver-print--decipher-digits-fa: three pages with page numbers, a numbered list running over them and years
#     (DejaVu Sans) — what tells one digit from another;
#   · driver-print--decipher-marks-fa: the marks ؛ : . ، ( ) - / and a rule of kashidas between two parts (FreeSerif);
#   · driver-print--decipher-short-fa: body text in DejaVu Sans, its headings in FreeSerif Bold — a short font whose
#     words the body uses too;
#   · driver-print--decipher-hollow-fa: a hollow face (each contour drawn with an inner one, as an outline font is):
#     DejaVu Sans made hollow;
#   · driver-print--decipher-cyrillic-ru: a Russian page (FreeSerif): not Arabic script, never deciphered;
#   · driver-print--decipher-cross-fa: DejaVu Sans renumbered with a /ToUnicode that names a few common forms as two
#     letters (a final ه «ها», an initial ب «با», a medial ی «یی»: about a tenth of the uses), as a real font's wrong
#     ToUnicode can — the text reads as language, so the judge accepts it; the check compares it with a reading;
#   · driver-print--decipher-ocr-terms-fa: body text in DejaVu Sans, a few terms in FreeSerif Bold whose words the body
#     does not use — too little text to read alone (OCR's votes, 3.5);
#   · driver-print--decipher-ocr-digits-fa: single digits in lines of text, no page numbers, no list, no year
#     (DejaVu Sans) — digits only their shapes, or OCR, can tell.
# IMITATED: we cannot run a print driver or Distiller here; the files follow what such files hold.
#   python3 scripts/make-decipher35.py   → pdf/producers/<the eleven files>.pdf and their corpus files
# Fonts: DejaVu Sans (DEJAVU=<folder>, else the Linux folders) and FreeSerif (FREEFONT=…). Their text stays out of
# letterstats.js (MEASURED in tools/build-letterstats.js) and of calibrate-shapes.js, for good. Lab files carry no
# personal metadata: Producer, Creator and Title only.
import io, os, sys
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rtl_pdf
from fontTools.ttLib import TTFont
from fontTools.pens.ttGlyphPen import TTGlyphPen
from rtl_pdf import Font, LAB, REG, visual
from rtl_pdf2 import Doc2, Renum, brackets
from rtl_cff import CffFace, Doc3

def find(env, dirs, name):
    for d in [os.environ.get(env)] + dirs:
        if d and os.path.isfile(os.path.join(d, name)): return os.path.join(d, name)
    raise SystemExit(name + ' not found: install it, or set ' + env + ' to the folder that holds it')
FREE = ['/usr/share/fonts/truetype/freefont', '/usr/share/fonts/gnu-free', '/usr/share/fonts/TTF']
SERIF, SERIF_B = find('FREEFONT', FREE, 'FreeSerif.ttf'), find('FREEFONT', FREE, 'FreeSerifBold.ttf')

# Persian digits are drawn as such, and a number keeps its digits left to right (rtl_pdf.visual shapes and reverses an
# Arabic-script token: a token of digits is not one)
DIGITS = '۰۱۲۳۴۵۶۷۸۹'
rtl_pdf.is_ar = lambda t: any('؀' <= c <= 'ۿ' and c not in DIGITS for c in t)
rtl_pdf.CODES |= {ord(c) for c in DIGITS + 'ـ؛'}

PRODUCER, DISTILLER = b'Lab print driver', b'Acrobat Distiller 9.0 (Windows)'
# TWIN=<folder>: the same files with a /ToUnicode naming every glyph right, written there with their Markdown — to check
# that the layout reads back as the Markdown says, apart from the fonts
TWIN = os.environ.get('TWIN')
if TWIN:
    os.makedirs(TWIN, exist_ok=True)
    _init, _put = Renum.__init__, Doc2.put
    def _twin_init(self, font, names=None):
        _init(self, font, None); self._nm = {}; self.names = lambda g: self._nm.get(g, '')
    def _twin_put(self, page, gl, x, y, size, f, extra=0.0, **kw):
        F = self.fonts[f]
        if isinstance(F, Renum):
            for c, n in gl: F._nm.setdefault(F.gid(c), n)
        return _put(self, page, gl, x, y, size, f, extra, **kw)
    Renum.__init__, Doc2.put = _twin_init, _twin_put
def out(name): return os.path.join(TWIN, name) if TWIN else os.path.join(LAB, 'pdf', 'producers', name)
def corpus(name, text):
    open(os.path.join(TWIN or os.path.join(LAB, 'corpus'), name), 'w', encoding='utf8').write(text); print('corpus/' + name)
R, L0, M, TOP, FOOT = 530, 65, 465, 770, 60

def md(blocks): return '\n\n'.join(blocks) + '\n'

class Pages:
    """a right-to-left text laid out over pages: a title, headings, paragraphs, list items, lines; fonts by role"""
    def __init__(self, doc, fonts, size=12, lead=1.7):
        self.d, self.f, self.size, self.lead, self.page, self.y = doc, fonts, size, lead, 1, TOP
        self.numbers = False
    def need(self, h):
        if self.y - h < FOOT + 30: self.foot(); self.page += 1; self.y = TOP
    def foot(self):
        if self.numbers:
            n = ''.join(DIGITS[int(c)] for c in str(self.page))
            self.d.line(self.page, n, FOOT, 10, 0, self.f['body'], center=self.d.w / 2)
    def title(self, t):
        self.need(40); self.d.line(self.page, t, self.y, 18, 0, self.f.get('title', self.f['body']), center=self.d.w / 2); self.y -= 40
    def heading(self, t):
        self.need(40); self.y -= 6; self.d.line(self.page, t, self.y, 14, R, self.f.get('head', self.f['body'])); self.y -= 26
    def para(self, t, f=None):
        f = f or self.f['body']
        ls = self.d.wrap(t, self.size, f, M)
        for k, l in enumerate(ls):
            self.need(self.size * self.lead)
            self.d.line(self.page, l, self.y, self.size, R, f, justify=M if k < len(ls) - 1 else None); self.y -= self.size * self.lead
        self.y -= 10
    def runs(self, parts):
        """one line of runs [(text, font role)], right to left from the right margin, a space between runs"""
        self.need(self.size * self.lead); x = R
        for k, (t, role) in enumerate(parts):
            f = self.f[role]; gl = brackets(visual(t))
            if k: x -= self.d.width([(0x20, ' ')], self.size, self.f['body'])
            w = self.d.width(gl, self.size, f); self.d.put(self.page, gl, x - w, self.y, self.size, f); x -= w
        self.y -= self.size * self.lead
    def item(self, n, t):
        """a numbered item, logical «۱. text», as make-lists29-rtl.py draws one: the text, then (at its right) the period
        and the number left to right; its next lines set in under its text"""
        num = ''.join(DIGITS[int(c)] for c in str(n)); f = self.f['body']
        w = self.d.width([(ord(c), c) for c in num + '. '], self.size, f)
        ls = self.d.wrap(t, self.size, f, M - w - 10)
        for k, l in enumerate(ls):
            self.need(self.size * self.lead)
            gl = brackets(visual(l))
            if not k: gl = gl + [(0x20, ' '), (ord('.'), '.')] + [(ord(c), c) for c in num]
            x = (R if not k else R - w) - self.d.width(gl, self.size, f)
            self.d.put(self.page, gl, x, self.y, self.size, f); self.y -= self.size * self.lead
    def brk(self): self.foot(); self.page += 1; self.y = TOP
    def done(self): self.foot()

def hollow(F, inset=0.035):
    """F's glyphs drawn hollow, as an outline face is: each contour, then the same contour moved inward (to the ink's
    side) and drawn the other way round — a counter in every part (advances kept)"""
    t = TTFont(io.BytesIO(F.bytes)); glyf = t['glyf']; d = inset * t['head'].unitsPerEm
    for name in t.getGlyphOrder():
        g = glyf[name]
        if name == '.notdef' or g.numberOfContours <= 0: continue
        coords, ends, flags = g.getCoordinates(glyf)
        pen = TTGlyphPen(None); s = 0
        for e in ends:
            pts = [tuple(coords[i]) for i in range(s, e + 1)]; on = [flags[i] & 1 for i in range(s, e + 1)]; s = e + 1
            n = len(pts)
            if n < 3: continue
            inner = []
            for i in range(n):
                (ax, ay), (bx, by) = pts[i - 1], pts[(i + 1) % n]
                tx, ty = bx - ax, by - ay; ln = (tx * tx + ty * ty) ** 0.5 or 1
                inner.append((round(pts[i][0] + d * ty / ln), round(pts[i][1] - d * tx / ln)))   # (the ink lies on a TrueType contour's right)
            for P, O in ((pts, on), (inner[::-1], on[::-1])):
                k0 = O.index(1) if 1 in O else 0
                P, O = P[k0:] + P[:k0], O[k0:] + O[:k0]
                pen.moveTo(P[0]); k = 1
                while k < len(P):
                    if O[k]: pen.lineTo(P[k]); k += 1
                    else:
                        offs = []
                        while k < len(P) and not O[k]: offs.append(P[k]); k += 1
                        pen.qCurveTo(*(offs + [P[k] if k < len(P) else P[0]]))
                        if k < len(P): k += 1
                pen.closePath()
        glyf[name] = pen.glyph()
    rtl_pdf.fixed(t)
    buf = io.BytesIO(); t.save(buf); F.bytes = buf.getvalue(); F.font = TTFont(io.BytesIO(F.bytes))
    return F

# ---- the texts ---------------------------------------------------------------------------------------------------------
BODY = ('کارگاه سفال روستا', [
    'در دامنه کوه، کنار رودخانه‌ای که از میان باغ‌های گردو می‌گذرد، روستایی هست که مردمش از قدیم سفال می‌سازند. خاک رس را '
    'از کنار رودخانه می‌آورند، چند روز در آب می‌خوابانند و بعد با پا ورز می‌دهند تا نرم و یکدست شود. هر خانواده راز کوچکی '
    'برای آماده کردن گل دارد و آن را از پدر و مادر خود یاد گرفته است.',
    'کارگاه بزرگ روستا در ساختمانی سنگی است که سقف چوبی بلندی دارد. شش چرخ سفالگری در یک ردیف کنار پنجره‌ها گذاشته شده '
    'تا نور روز روی کار بیفتد. استادکار پیر روستا هر صبح زودتر از همه می‌آید، آتش کوره را روشن می‌کند و به شاگردان نشان '
    'می‌دهد که چگونه گل را روی چرخ بالا بکشند و دیواره کاسه را نازک کنند.',
    'ساختن یک کوزه ساده چند ساعت بیشتر طول نمی‌کشد، اما خشک شدن آن چند روز زمان می‌خواهد. کوزه‌ها را در سایه و دور از باد '
    'می‌گذارند تا آرام آرام خشک شوند و ترک برندارند. اگر هوا مرطوب باشد کار کندتر پیش می‌رود و گاهی باید یک هفته صبر کرد.',
    'پس از خشک شدن، نوبت پختن است. کوره را با چوب درختان خشک گرم می‌کنند و سفال‌ها را با دقت روی هم می‌چینند. آتش باید '
    'آرام بالا برود، چون گرمای ناگهانی ظرف‌ها را می‌شکند. پختن یک بار کوره از غروب تا صبح ادامه دارد و همیشه یک نفر بیدار '
    'می‌ماند تا آتش را نگه دارد.',
    'رنگ سفال‌های این روستا از خاک‌ها و سنگ‌های همان منطقه به دست می‌آید. رنگ قرمز از خاکی است که در دره پایین پیدا '
    'می‌شود و رنگ سبز از سنگی که آن را می‌سایند و با آب می‌آمیزند. نقش‌ها بیشتر گل و برگ و پرنده است و هر زن نقش‌های خود '
    'را دارد که از دیگران جدا می‌شود.',
    'در سال‌های گذشته بسیاری از جوانان روستا برای کار به شهر رفتند و کارگاه کم‌رونق شد. اما چند سال است که گردشگران برای '
    'دیدن کار سفالگران می‌آیند و بعضی از آن‌ها چند روز می‌مانند تا خودشان چیزی بسازند. این رفت و آمد به کارگاه جان تازه '
    'داده و چند جوان دوباره به روستا برگشته‌اند.',
    'شورای روستا تصمیم گرفته است اتاقی کنار کارگاه را به نمایشگاه تبدیل کند تا کارهای قدیمی و تازه در کنار هم دیده شوند. '
    'قرار است برای هر ظرف برگه‌ای نوشته شود که نام سازنده، سال ساخت و جای خاک آن را بگوید. بچه‌های مدرسه هم در نوشتن این '
    'برگه‌ها کمک می‌کنند.',
    'سفالگران می‌گویند کار با گل صبر می‌خواهد و دست را با چشم آشتی می‌دهد. شاید به همین دلیل است که کسانی که یک بار پشت '
    'چرخ نشسته‌اند، باز هم برمی‌گردند. برای مردم روستا این کار فقط راه نان نیست، بلکه بخشی از زندگی و یاد گذشتگان است.'])

CID = ('ایستگاه هواشناسی مدرسه', [
    'دانش‌آموزان مدرسه ما از پاییز گذشته یک ایستگاه هواشناسی کوچک روی بام ساختمان راه انداختند. در این ایستگاه دماسنج، '
    'بادنما، باران‌سنج و دستگاهی برای اندازه گرفتن رطوبت هوا هست. هر روز دو نفر از بچه‌ها نوبت دارند که عددها را بخوانند '
    'و در دفتر بنویسند.',
    'معلم علوم به ما یاد داد که چگونه از این عددها نمودار بکشیم و ببینیم هوا در هفته‌های مختلف چگونه تغییر می‌کند. ما فهمیدیم '
    'که سردترین شب‌ها معمولا وقتی است که آسمان صاف است و باد نمی‌وزد. بعضی از بچه‌ها حتی پیش‌بینی هوای فردا را روی تخته '
    'سیاه راهرو می‌نویسند.',
    'در بهار قرار است داده‌های یک سال را با داده‌های ایستگاه فرودگاه شهر مقایسه کنیم. اگر نتیجه خوب باشد، گزارش کوتاهی '
    'برای روزنامه محلی می‌فرستیم و از مدرسه‌های دیگر دعوت می‌کنیم که آن‌ها هم ایستگاه خود را بسازند.'])

SUBSETS = ('دفترچه یادداشت باغبان', [
    'امروز اولین روز بهار بود و زمین هنوز سرد بود. خاک باغچه را با بیل برگرداندم و کود حیوانی را که از پاییز نگه داشته بودم '
    'در آن پخش کردم. پرنده‌ها روی شاخه درخت سیب نشسته بودند و منتظر بودند کرمی از زیر خاک بیرون بیاید.',
    'بذر گوجه و فلفل را در گلدان‌های کوچک کاشتم و کنار پنجره آشپزخانه گذاشتم. این بذرها هنوز گرمای بیرون را تاب نمی‌آورند '
    'و باید چند هفته در خانه بمانند. هر صبح به آن‌ها آب کمی می‌دهم تا خاکشان خشک نشود.',
    'باران شب گذشته همه جا را خیس کرد و جوی کنار باغ پر از آب شد. پیاز گل‌هایی که پارسال کاشته بودم سر از خاک بیرون آورده‌اند '
    'و برگ‌های سبز و باریکشان در آفتاب برق می‌زند. همسایه می‌گفت امسال لاله‌ها زودتر از همیشه گل می‌دهند.',
    'نهال‌های گوجه بزرگ شده‌اند و دیگر جای گلدان‌ها برایشان تنگ است. آن‌ها را با احتیاط به باغچه بردم و کنار هر کدام چوبی '
    'فرو کردم تا ساقه‌شان به آن تکیه کند. شب‌ها هنوز خنک است و روی آن‌ها پارچه نازکی می‌کشم.',
    'علف‌های هرز همه جا سبز شده‌اند و هر روز باید چند ساعتی آن‌ها را بکنم. پیرمرد باغ کناری می‌گوید بهترین وقت این کار صبح '
    'زود است، وقتی خاک هنوز نم دارد و ریشه‌ها راحت بیرون می‌آیند. حرفش درست بود و کار زودتر تمام شد.',
    'اولین توت فرنگی‌های سرخ امروز رسید. نیمی از آن‌ها را بچه‌ها پیش از رسیدن به خانه خوردند و بقیه را با شیر خوردیم. حالا '
    'وقت آن است که برای پاییز فکری کنم و جایی برای کاشتن سیر و پیاز زمستانی آماده کنم.'])

DIGITS_T = 'گزارش کتابخانه سیار'
DIGITS_P = [
    'کتابخانه سیار شهرستان کار خود را در سال ۱۳۹۸ با یک خودروی کوچک و چهارصد جلد کتاب آغاز کرد. در سال ۱۴۰۰ خودروی دوم '
    'خریده شد و در سال ۱۴۰۲ شمار کتاب‌ها به بیش از سه هزار جلد رسید. این گزارش کارهای انجام شده و برنامه سال ۱۴۰۳ را '
    'به کوتاهی بیان می‌کند.',
    'خودروها هر هفته به روستاهای دور از شهر می‌روند و در هر روستا دو یا سه ساعت می‌مانند. کارهای اصلی این دو سال چنین بوده است:']
ITEMS = [
    'باز کردن ایستگاه تازه در شش روستای کوهستانی که پیش از این هیچ کتابی به آن‌ها نمی‌رسید',
    'برگزاری جلسه قصه‌گویی برای کودکان در روزهای پنجشنبه',
    'خرید کتاب‌های درسی کمکی برای دانش‌آموزان دبیرستان',
    'آموزش دو نفر از جوانان هر روستا برای نگهداری از قفسه کوچک کتاب در مسجد یا مدرسه',
    'ثبت نام اعضای تازه و دادن کارت عضویت رایگان',
    'جمع کردن کتاب‌های اهدایی مردم شهر و فرستادن آن‌ها به روستاها',
    'برگزاری مسابقه کتابخوانی در تابستان سال ۱۴۰۱ با شرکت بیش از دویست نوجوان',
    'تعمیر خودروی اول و نصب قفسه‌های تازه در آن',
    'چاپ فهرست کتاب‌ها و پخش آن در روستاها تا مردم بتوانند کتاب دلخواه خود را سفارش دهند',
    'همکاری با خانه بهداشت روستاها برای پخش کتاب‌های ساده درباره سلامت خانواده',
    'برگزاری نمایشگاه عکس از روستاها در کتابخانه مرکزی شهر در زمستان سال ۱۳۹۹',
    'آماده کردن برنامه سفر خودروها برای سال ۱۴۰۳ با دو ایستگاه بیشتر در دشت']
DIGITS_END = ('در سال ۱۴۰۳ قرار است خودروی سوم هم خریده شود. هزینه آن را شهرداری و چند نفر از نیکوکاران شهر با هم می‌پردازند '
              'و راننده آن از میان جوانان یکی از روستاها انتخاب می‌شود.')

MARKS = ('نشست ماهانه انجمن خانه و مدرسه', [
    'نشست این ماه در سالن مدرسه برگزار شد؛ بیشتر پدران و مادران آمده بودند. دستور جلسه سه بخش داشت: گزارش مدیر، برنامه '
    'اردوی بهار و پیشنهادهای اعضا.',
    'مدیر مدرسه گفت تعمیر سقف کلاس‌ها (که از پاییز عقب افتاده بود) در تعطیلات انجام می‌شود. هزینه آن را اداره آموزش و '
    'پرورش می‌پردازد؛ انجمن فقط خرید پرده‌های تازه را بر عهده دارد.',
    'ــــــــــــــــــــ',
    'برای اردوی بهار دو جا پیشنهاد شد: باغ گیاه‌شناسی و موزه تاریخ طبیعی. بیشتر اعضا باغ را برگزیدند، چون بچه‌ها در آن '
    'جا بیشتر بازی می‌کنند. تاریخ اردو ۱۴۰۴/۰۲/۱۰ است و هزینه هر نفر نیم یا یک سوم هزینه سال گذشته خواهد بود.',
    'یکی از مادران پیشنهاد کرد کتابخانه کلاس‌ها دوباره باز شود. دیگری گفت: باید کسی مسئول آن باشد. قرار شد هر کلاس یک '
    'نماینده داشته باشد - یک دانش‌آموز و یک پدر یا مادر - تا کار کتابخانه را پیش ببرند.'])

SHORT_T = 'راهنمای کوتاه نگهداری دوچرخه'
SHORT = [
    ('تمیز کردن دوچرخه', [
        'دوچرخه‌ای که تمیز نگه داشته شود عمر بیشتری دارد و بهتر کار می‌کند. پس از هر سواری در روزهای بارانی، گل و خاک را با '
        'پارچه نم‌دار از روی بدنه و چرخ‌ها پاک کنید. برای تمیز کردن دوچرخه از آب پرفشار استفاده نکنید، چون آب به داخل یاتاقان‌ها '
        'می‌رود و آن‌ها را زنگ می‌زند.']),
    ('روغن زدن زنجیر', [
        'زنجیر خشک صدا می‌دهد و زود ساییده می‌شود. هر چند هفته یک بار زنجیر را با پارچه تمیز کنید و روی هر حلقه آن یک قطره '
        'روغن بریزید. پس از روغن زدن زنجیر، چند بار رکاب بزنید و روغن اضافه را پاک کنید تا خاک به آن نچسبد.']),
    ('باد لاستیک‌ها', [
        'لاستیک کم‌باد سواری را سخت می‌کند و زود پنچر می‌شود. فشار مناسب روی دیواره هر لاستیک نوشته شده است. باد لاستیک‌ها '
        'را دست کم هفته‌ای یک بار با تلمبه‌ای که فشارسنج دارد اندازه بگیرید.']),
    ('بازدید ترمزها', [
        'ترمز مهم‌ترین بخش ایمنی دوچرخه است. پیش از هر سفر دو دسته ترمز را بفشارید و ببینید چرخ‌ها خوب می‌ایستند یا نه. اگر '
        'لنت‌ها ساییده شده‌اند، بازدید ترمزها را به تعمیرکار بسپارید و لنت تازه بگذارید.'])]

HOLLOW = ('خانه فرهنگ محله', [
    'خانه فرهنگ محله ما در ساختمانی قدیمی کنار میدان است. در این خانه کلاس‌های نقاشی، خوشنویسی، موسیقی و شطرنج برگزار '
    'می‌شود و هر کس می‌تواند در آن‌ها نام بنویسد. بیشتر معلمان از ساکنان همین محله‌اند و کار خود را رایگان انجام می‌دهند.',
    'در حیاط خانه درخت چنار بزرگی هست که تابستان‌ها سایه آن پناه همه است. عصرها پیرمردهای محله زیر این درخت می‌نشینند، چای '
    'می‌نوشند و از روزهای گذشته می‌گویند. بچه‌ها هم دور حوض وسط حیاط بازی می‌کنند.',
    'هر ماه یک بار در خانه فرهنگ نمایشگاهی از کارهای شاگردان برپا می‌شود. خانواده‌ها برای دیدن کارها می‌آیند و گاهی یک '
    'نقاشی یا تابلوی خوشنویسی را می‌خرند. پول آن صرف خرید رنگ، کاغذ و قلم برای کلاس‌ها می‌شود.'])

RU = ('Городской сад', [
    'Каждое утро в городском саду собираются люди всех возрастов. Одни гуляют по аллеям, другие читают на скамейках, а дети '
    'кормят уток у пруда. Сад открыт с раннего утра до позднего вечера.',
    'Весной садовники сажают новые деревья и цветы. В этом году вдоль главной аллеи посадили сорок молодых лип, а возле '
    'фонтана появились клумбы с тюльпанами. Жители помогают поливать растения в жаркие дни.',
    'Летом в саду играет оркестр, а по выходным проходят ярмарки, где мастера продают свои изделия. Осенью все вместе '
    'собирают опавшие листья и готовят сад к зиме.'])

CROSS = ('برنامه هفته کتاب در محله', [
    'هفته کتاب امسال با همکاری خانه فرهنگ و کتابخانه محله برگزار می‌شود. در این هفته هر روز برنامه‌ای برای کودکان، '
    'نوجوانان و بزرگسالان در نظر گرفته شده است و همه برنامه‌ها رایگان است.',
    'روز اول با بازدید از کتابخانه و آشنایی با بخش‌های آن آغاز می‌شود. روز دوم ویژه کودکان است و قصه‌گوها کتاب‌های تازه را '
    'برای آنها می‌خوانند. روز سوم نشستی با نویسندگان محلی برگزار می‌شود که درباره کارهای خود سخن می‌گویند.',
    'در روزهای پایانی بازارچه کتاب برپا می‌شود و هر کس می‌تواند کتاب‌های خوانده‌شده خود را با کتاب‌های دیگران عوض کند. '
    'خانواده‌ها می‌توانند برای نام نوشتن در برنامه‌ها به کتابخانه بیایند یا با شماره تلفن آن تماس بگیرند.'])

TERMS_T = 'آشنایی با گیاهان دارویی کوهستان'
TERMS = [
    ('در دامنه‌های کوه گیاهان بسیاری می‌رویند که مردم از قدیم برای درمان دردهای ساده از آنها بهره برده‌اند. در این نوشته با '
     'چند گیاه آشنا می‌شویم که در بهار و تابستان به آسانی پیدا می‌شوند.', None),
    ('گیاهی کوتاه با برگ‌های ریز و بوی تند است که بیشتر روی سنگ‌ها می‌روید. دم‌کرده آن را برای سرماخوردگی می‌نوشند.', 'آویشن کوهی'),
    ('گیاهی با گل‌های زرد و برگ‌های پرز دار است. مردم گل‌های آن را خشک می‌کنند و در زمستان به کار می‌برند.', 'گل گاوزبان'),
    ('گیاهی بلند با گل‌های سفید ریز است که کنار جوی‌ها می‌روید و بوی خوشی دارد.', 'بومادران'),
    ('پیش از چیدن هر گیاه باید آن را خوب شناخت، چون بعضی گیاهان مانند هم هستند و یکی از آنها ممکن است زیان داشته باشد. بهتر '
     'است گیاهان را از کسانی بخرید که آنها را می‌شناسند.', None)]

OCRDIG = ('نتیجه مسابقه فوتبال مدرسه‌ها', [
    'در هفته گذشته مسابقه‌های فوتبال مدرسه‌های منطقه برگزار شد. تیم مدرسه ما در بازی اول ۳ گل زد و ۱ گل خورد. در بازی دوم '
    'نتیجه ۲ بر ۲ بود و در بازی سوم با ۴ گل برنده شدیم.',
    'در جدول گروه، تیم ما با ۷ امتیاز اول شد و تیم مدرسه کناری با ۵ امتیاز دوم شد. بهترین گلزن گروه ۶ گل زد و ۸ بار هم '
    'به هم‌تیمی‌های خود پاس گل داد.',
    'بازی نیمه نهایی روز ۹ همین ماه برگزار می‌شود. ورزشگاه از ساعت ۰ تا ۲ بعد از نیمه شب برای آماده شدن بسته است و '
    'تماشاگران از ساعت ۳ بعد از ظهر می‌توانند وارد شوند.'])

# ---- the files ---------------------------------------------------------------------------------------------------------
def simple(fonts, text, path, doc, writer=None, numbers=False):
    D = writer or Doc2(fonts); P = Pages(D, {'body': 'F', 'title': 'T' if 'T' in fonts else 'F'}); P.numbers = numbers
    P.title(text[0])
    for p in text[1]: P.para(p)
    P.done(); D.write(out(path), DISTILLER if writer else PRODUCER, doc)
    corpus(doc + '.md', md(['# ' + text[0]] + text[1]))

# 1. body text, two pages
simple({'F': Renum(Font(REG, 'AABAAA+DemoSansBook'))}, BODY, 'driver-print--decipher-body-fa.pdf', 'decipher-body-fa')

# 2. CID-keyed CFF
class CffDoc:
    """Doc3 seen through Doc2's names: a face by its key"""
    def __init__(self, faces): self.D = Doc3(faces); self.w = self.D.w
    def width(self, gl, size, f): return self.D.width(gl, size, lambda c: f)
    def line(self, page, text, y, size, right, f, justify=None, center=None):
        self.D.line(page, text, y, size, right, lambda c: f, justify, center)
    def wrap(self, text, size, f, measure):
        res, cur = [], ''
        for wd in text.split(' '):
            t = (cur + ' ' + wd).strip()
            if cur and self.width(brackets(visual(t)), size, f) > measure: res.append(cur); cur = wd
            else: cur = t
        return res + [cur]
    def write(self, path, producer, title): self.D.write(path, producer, title)
FC = {'T': CffFace(SERIF_B, 'GLABBA+DemoNaskhBoldPS', kind='cid'), 'F': CffFace(SERIF, 'GLABBB+DemoNaskhPS', kind='cid')}
simple(FC, CID, 'distiller-cff--decipher-cid-fa.pdf', 'decipher-cid-fa', writer=CffDoc(FC))

# 3. one font in six subsets, a page each
names = ['AAB%sAA+DemoNaskh' % chr(65 + k) for k in range(6)]
fonts = {'F%d' % k: Renum(Font(SERIF, nm)) for k, nm in enumerate(names)}
D = Doc2(fonts)
for k, p in enumerate(SUBSETS[1]):
    P = Pages(D, {'body': 'F%d' % k}); P.page = k + 1
    if not k: P.title(SUBSETS[0])
    P.para(p)
D.write(out('driver-print--decipher-subsets-fa.pdf'), PRODUCER, 'decipher-subsets-fa')
corpus('decipher-subsets-fa.md', md(['# ' + SUBSETS[0]] + SUBSETS[1]))

# 4. digits: page numbers, a numbered list over pages, years
D = Doc2({'F': Renum(Font(REG, 'AACAAA+DemoSansBook'))}); P = Pages(D, {'body': 'F'}, lead=1.9); P.numbers = True
P.title(DIGITS_T)
for p in DIGITS_P: P.para(p)
for k, t in enumerate(ITEMS):
    if k in (4, 9): P.brk()                              # (three pages: the list runs over them)
    P.item(k + 1, t)
P.y -= 8; P.para(DIGITS_END); P.done()
D.write(out('driver-print--decipher-digits-fa.pdf'), PRODUCER, 'decipher-digits-fa')
corpus('decipher-digits-fa.md', md(['# ' + DIGITS_T] + DIGITS_P + ['\n'.join('%d. %s' % (k + 1, t) for k, t in enumerate(ITEMS)), DIGITS_END]))

# 5. marks
simple({'F': Renum(Font(SERIF, 'AADAAA+DemoNaskh'))}, MARKS, 'driver-print--decipher-marks-fa.pdf', 'decipher-marks-fa')

# 6. a short font: the headings
D = Doc2({'F': Renum(Font(REG, 'AAEAAA+DemoSansBook')), 'H': Renum(Font(SERIF_B, 'AAEAAB+DemoNaskhBold'))})
P = Pages(D, {'body': 'F', 'head': 'H', 'title': 'H'}); P.title(SHORT_T)
for h, ps in SHORT:
    P.heading(h)
    for p in ps: P.para(p)
P.done(); D.write(out('driver-print--decipher-short-fa.pdf'), PRODUCER, 'decipher-short-fa')
corpus('decipher-short-fa.md', md(['# ' + SHORT_T] + sum([['## ' + h] + ps for h, ps in SHORT], [])))

# 7. a hollow face
simple({'F': Renum(hollow(Font(REG, 'AAFAAA+DemoSansOutline')))}, HOLLOW, 'driver-print--decipher-hollow-fa.pdf', 'decipher-hollow-fa')

# 8. Russian: not Arabic script
PERSIAN = set(rtl_pdf.CODES); rtl_pdf.CODES = {ord(c) for c in ' .,-'} | set(range(0x410, 0x450)) | {0x401, 0x451}
D = Doc2({'F': Renum(Font(SERIF, 'AAGAAA+DemoSerif'))}, lang='ru-RU'); rtl_pdf.CODES = PERSIAN; y = TOP
D.line(1, RU[0], y, 18, 0, 'F', ltr=True, center=D.w / 2); y -= 40
for p in RU[1]:
    cur = ''
    for w in p.split(' ') + [None]:
        t = (cur + ' ' + w).strip() if w is not None else None
        if t is None or D.width([(ord(c), c) for c in t], 12, 'F') > M:
            D.put(1, [(ord(c), c) for c in cur], L0, y, 12, 'F'); y -= 20; cur = w or ''
        else: cur = t
    y -= 10
D.write(out('driver-print--decipher-cyrillic-ru.pdf'), PRODUCER, 'decipher-cyrillic-ru')
corpus('decipher-cyrillic-ru.md', md(['# ' + RU[0]] + RU[1]))

# 9. a ToUnicode the judge accepts, wrong for a few common forms
X = Font(REG, 'AAHAAA+DemoSansBook')
name_of = {}
for t in [CROSS[0]] + CROSS[1]:
    for c, n in brackets(visual(t)): name_of.setdefault(X.gid(c), n)
WRONG = {X.gid(0xFEEA): 'ها', X.gid(0xFE91): 'با', X.gid(0xFBFF): 'یی'}       # final ه, initial ب, medial ی
simple({'F': Renum(X, names=lambda g: WRONG.get(g, name_of.get(g, '')))}, CROSS, 'driver-print--decipher-cross-fa.pdf', 'decipher-cross-fa')

# 10. a few terms in a short font of their own
D = Doc2({'F': Renum(Font(REG, 'AAIAAA+DemoSansBook')), 'B': Renum(Font(SERIF_B, 'AAIAAB+DemoNaskhBold'))})
P = Pages(D, {'body': 'F', 'term': 'B'}); P.title(TERMS_T); blocks = ['# ' + TERMS_T]
for p, term in TERMS:
    if term is None: P.para(p); blocks.append(p); continue
    P.runs([(term + ':', 'term')]); P.para(p); blocks += ['**' + term + ':**', p]
P.done(); D.write(out('driver-print--decipher-ocr-terms-fa.pdf'), PRODUCER, 'decipher-ocr-terms-fa')
corpus('decipher-ocr-terms-fa.md', md(blocks))

# 11. single digits, nothing to count them by
simple({'F': Renum(Font(REG, 'AAJAAA+DemoSansBook'))}, OCRDIG, 'driver-print--decipher-ocr-digits-fa.pdf', 'decipher-ocr-digits-fa')
