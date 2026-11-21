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
import io, os, sys, zlib, random, zipfile
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rtl_pdf
from rtl_pdf import LAB, REG, BOLD, visual
from rtl_pdf2 import Doc2, brackets
from fontTools.ttLib import TTFont
from fontTools.cffLib import cffStandardStrings
from fontTools.misc.psCharStrings import T2CharString
from fontTools.pens.t2CharStringPen import T2CharStringPen
from fontTools.pens.transformPen import TransformPen

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

# ---- a small CFF writer ------------------------------------------------------------------------------------------------
STD = {s: i for i, s in enumerate(cffStandardStrings)}
def dint(v): return bytes([29]) + int(v).to_bytes(4, 'big', signed=True)       # five bytes, so offsets can be filled late
def dreal(v):
    nib = []
    for ch in ('%.12g' % v).replace('e-', 'c').replace('e+', 'b'):
        nib.append(int(ch) if ch.isdigit() else {'.': 0xa, 'b': 0xb, 'c': 0xc, '-': 0xe}[ch])
    nib.append(0xf)
    if len(nib) % 2: nib.append(0xf)
    return bytes([30]) + bytes(nib[i] << 4 | nib[i + 1] for i in range(0, len(nib), 2))
def esc(n): return bytes([12, n])
def index(items):
    if not items: return b'\0\0'
    offs, o = [1], 1
    for it in items: o += len(it); offs.append(o)
    size = 1 if o < 0x100 else 2 if o < 0x10000 else 3
    return len(items).to_bytes(2, 'big') + bytes([size]) + b''.join(x.to_bytes(size, 'big') for x in offs) + b''.join(items)
def bias(n): return 107 if n < 1240 else 1131 if n < 33900 else 32768
def compiled(prog): c = T2CharString(program=prog); c.compile(); return c.bytecode
MOVES = ('rmoveto', 'hmoveto', 'vmoveto')

def cff_program(name, glyphs, cids=None, codes=None, units=1000, subrs=False, bbox=(0, -300, 1000, 900)):
    """glyphs: [(glyph name, T2 path program without width or endchar, width)], .notdef first. cids: a CID per glyph (a
    CID-keyed font), else a plain font whose built-in encoding gives codes[i] to glyph i (past .notdef). units: units
    an em (FontMatrix 1/units). subrs: each outline drawn by a local subroutine, which calls a global one for the
    outline's later contours"""
    gsub, lsub, chars = [], [], []
    for gname, path, width in glyphs:
        if subrs and path:
            moves = [i for i, t in enumerate(path) if t in MOVES]
            first, rest = path, []
            if len(moves) > 1:                       # cut where the second contour's moveto operands start
                j = moves[1] - 1
                while j >= 0 and not isinstance(path[j], str): j -= 1
                first, rest = path[:j + 1], path[j + 1:]
            if rest:
                gsub.append(rest + ['return']); first = first + [('G', len(gsub) - 1), 'callgsubr']
            lsub.append(first + ['return'])
            chars.append([width, ('L', len(lsub) - 1), 'callsubr', 'endchar'])
        else:
            chars.append([width] + list(path) + ['endchar'])
    gb, lb = bias(len(gsub)), bias(len(lsub))
    fix = lambda p: [(t[1] - (gb if t[0] == 'G' else lb)) if isinstance(t, tuple) else t for t in p]
    gsub_b, lsub_b, char_b = [compiled(fix(p)) for p in gsub], [compiled(fix(p)) for p in lsub], [compiled(fix(p)) for p in chars]
    strings = []
    def sid(s):
        if s in STD: return STD[s]
        if s not in strings: strings.append(s)
        return 391 + strings.index(s)
    if cids is not None:
        ros = (sid('Adobe'), sid('Identity'))
        charset = bytes([0]) + b''.join(c.to_bytes(2, 'big') for c in cids[1:])
        extra = bytes([3]) + (1).to_bytes(2, 'big') + (0).to_bytes(2, 'big') + bytes([0]) + len(glyphs).to_bytes(2, 'big')
    else:
        charset = bytes([0]) + b''.join(sid(g[0]).to_bytes(2, 'big') for g in glyphs[1:])
        extra = bytes([0, len(codes)]) + bytes(codes)                       # Encoding format 0
    private = (dint(6) + bytes([19])) if lsub else (dint(0) + bytes([20]))  # Subrs right after it, or defaultWidthX 0
    fm = (dreal(1.0 / units) + dint(0) + dint(0) + dreal(1.0 / units) + dint(0) + dint(0) + esc(7)) if units != 1000 else b''
    box = b''.join(dint(round(v * units / 1000)) for v in bbox) + bytes([5])
    def top(o):
        if cids is not None:
            return (dint(ros[0]) + dint(ros[1]) + dint(0) + esc(30) + dint(max(cids) + 1) + esc(34) + box + fm +
                    dint(o['charset']) + bytes([15]) + dint(o['extra']) + esc(37) + dint(o['fdarray']) + esc(36) +
                    dint(o['chars']) + bytes([17]))
        return (box + fm + dint(o['charset']) + bytes([15]) + dint(o['extra']) + bytes([16]) + dint(o['chars']) + bytes([17]) +
                dint(len(private)) + dint(o['private']) + bytes([18]))
    fd = lambda o: dint(len(private)) + dint(o['private']) + bytes([18])
    zero = dict.fromkeys(('charset', 'extra', 'fdarray', 'chars', 'private'), 0)
    head = bytes([1, 0, 4, 4]) + index([name.encode()])
    top_len = len(index([top(zero)]))
    strings_idx, gsub_idx = index([s.encode() for s in strings]), index(gsub_b)
    o = {}; pos = len(head) + top_len + len(strings_idx) + len(gsub_idx)
    o['charset'] = pos; pos += len(charset)
    o['extra'] = pos; pos += len(extra)
    chars_idx = index(char_b); o['chars'] = pos; pos += len(chars_idx)
    if cids is not None:
        fd_len = len(index([fd(zero)])); o['fdarray'] = pos; pos += fd_len
    o['private'] = pos
    body = head + index([top(o)]) + strings_idx + gsub_idx + charset + extra + chars_idx
    if cids is not None: body += index([fd(o)])
    assert len(body) == o['private']
    return body + private + (index(lsub_b) if lsub else b'')

def bars(gid, adv, units):
    """a glyph drawn as one to three bars made from its glyph id (make-unknown32.py's abstract glyphs): shapes no font has"""
    h = (gid * 2654435761) & 0xFFFFFFFF; prog = []; x = y = 0
    for k in range(1 + h % 3):
        b = (h >> (5 * k)) & 31
        x0 = round(adv * (0.1 + 0.25 * (b % 3))); x1 = x0 + round(adv * 0.18) + 10
        y0 = round(units * (-0.1 + 0.15 * (b % 4))); y1 = y0 + round(units * (0.2 + 0.1 * (b % 5)))
        prog += [x0 - x, y0 - y, 'rmoveto', y1 - y0, x1 - x0, y0 - y1, 'vlineto']; x, y = x1, y0
    return prog

# ---- a face drawn through a CFF program ----------------------------------------------------------------------------------
class CffFace:
    """a source TrueType face whose used glyphs become a CFF program. kind: 'cid' (codes = the source's glyph ids, as
    CIDs) or 'plain' (one-byte codes). coding (plain): 'renum' (33… in order of first use, the space 32), 'ascii' (the
    character's own code) or 'shuffle' (1… shuffled, after prepare()). names: 'std' (the source's standard glyph names)
    or 'none' (names that say nothing). tounicode: write a /ToUnicode of the names drawn (base letters)."""
    def __init__(self, src, ps, kind='plain', coding='renum', names='none', units=None, subrs=False, tounicode=False, seed=1, bars=False):
        self.t = TTFont(src); self.cmap = self.t.getBestCmap(); self.gs = self.t.getGlyphSet(); self.upem = self.t['head'].unitsPerEm
        self.ps, self.kind, self.coding, self.names, self.subrs, self.tu = ps, kind, coding, names, subrs, tounicode
        self.units = units or self.upem; self.used, self.code, self.text, self.seed, self.bars = [], {}, {}, seed, bars
    def adv(self, c, size): return self.t['hmtx'][self.cmap[c]][0] * size / self.upem
    def _use(self, g):
        if g in self.code: return
        self.used.append(g)
        if self.kind == 'cid': self.code[g] = self.t.getGlyphID(g)
        elif self.coding == 'renum':
            self.code[g] = 32 if g == self.cmap.get(0x20) else 33 + sum(1 for v in self.code.values() if v != 32)
        elif self.coding == 'ascii': self.code[g] = next(u for u, n in self.cmap.items() if n == g and u < 0x80)
        else: self.code[g] = None
        assert self.kind == 'cid' or self.code[g] is None or self.code[g] < 256
    def prepare(self, lines):
        """shuffle coding: every glyph the lines draw, then codes 1… in a shuffled order"""
        for t in lines:
            for c, _ in brackets(visual(t)): self._use(self.cmap[c])
        self._use(self.cmap[0x20])
        ks = list(range(1, len(self.used) + 1)); random.Random(self.seed).shuffle(ks)
        self.code = dict(zip(self.used, ks))
    def put(self, c, n):
        g = self.cmap[c]; self._use(g); k = self.code[g]
        self.text.setdefault(k, n)
        return ('%04X' if self.kind == 'cid' else '%02X') % k
    def w1000(self, g): return round(self.t['hmtx'][g][0] * 1000 / self.upem)
    def program(self):
        s = self.units / self.upem; glyphs = []
        for i, g in enumerate(['.notdef'] + self.used):
            pen = T2CharStringPen(None, self.gs); self.gs[g].draw(TransformPen(pen, (s, 0, 0, s, 0, 0)))
            path = [t for t in pen.getCharString().program if t != 'endchar']
            if self.bars and path: path = bars(self.t.getGlyphID(g), round(self.t['hmtx'][g][0] * s), self.units)
            nm = g if self.names == 'std' and g in STD else '.notdef' if i == 0 else 'x%d' % (100 + i)
            glyphs.append((nm, path, round(self.t['hmtx'][g][0] * s)))
        if self.kind == 'cid':
            return cff_program(self.ps.split('+')[-1], glyphs, cids=[0] + [self.code[g] for g in self.used], units=self.units)
        return cff_program(self.ps.split('+')[-1], glyphs, codes=[self.code[g] for g in self.used], units=self.units, subrs=self.subrs)
    def pdf(self, obj, stream):
        prog = self.program()
        sub = 'CIDFontType0C' if self.kind == 'cid' else 'Type1C'
        ff = obj(stream(prog, '/Subtype /%s' % sub))
        desc = obj('<< /Type /FontDescriptor /FontName /%s /Flags %d /FontBBox [-300 -500 1200 1000] /ItalicAngle 0 /Ascent 900 /Descent -300 /CapHeight 700 /StemV 80 /FontFile3 %d 0 R >>'
                   % (self.ps, 4 if self.kind == 'cid' else 32 if self.names == 'std' else 4, ff))
        u16 = lambda t: ''.join('%04X' % ord(x) for x in t)
        if self.kind == 'cid':
            w = ' '.join('%d [%d]' % (self.code[g], self.w1000(g)) for g in sorted(self.used, key=lambda g: self.code[g]))
            cid = obj('<< /Type /Font /Subtype /CIDFontType0 /BaseFont /%s /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor %d 0 R /DW 1000 /W [%s] >>' % (self.ps, desc, w))
            return obj('<< /Type /Font /Subtype /Type0 /BaseFont /%s-Identity-H /Encoding /Identity-H /DescendantFonts [%d 0 R] >>' % (self.ps.split('+')[-1], cid))
        by = {k: g for g, k in self.code.items()}; first, last = min(by), max(by)
        tu = ''
        if self.tu:
            cm = ('/CIDInit /ProcSet findresource begin 12 dict begin begincmap /CMapName /%s def /CMapType 2 def 1 begincodespacerange <00> <FF> endcodespacerange\n'
                  '%d beginbfchar\n%s\nendbfchar\nendcmap CMapName currentdict /CMap defineresource pop end end') % (
                  self.ps.split('+')[-1], len(self.text), '\n'.join('<%02X> <%s>' % (k, u16(t)) for k, t in sorted(self.text.items())))
            tu = ' /ToUnicode %d 0 R' % obj(stream(cm.encode()))
        return obj('<< /Type /Font /Subtype /Type1 /BaseFont /%s /FirstChar %d /LastChar %d /Widths [%s] /FontDescriptor %d 0 R%s >>'
                   % (self.ps, first, last, ' '.join(str(self.w1000(by[k])) if k in by else '0' for k in range(first, last + 1)), desc, tu))

class Doc3:
    """pages of glyphs in CffFaces; pick(code) names the face a glyph is drawn in"""
    def __init__(self, faces, w=595.28, h=841.89, lang='fa-IR'):
        self.faces, self.w, self.h, self.lang, self.pages = faces, w, h, lang, {}
    def width(self, gl, size, pick): return sum(self.faces[pick(c)].adv(c, size) for c, _ in gl)
    def put(self, page, gl, x, y, size, pick, extra=0.0):
        for c, n in gl:
            f = pick(c); hx = self.faces[f].put(c, n)
            self.pages.setdefault(page, []).append('BT /%s %.2f Tf 1 0 0 1 %.3f %.3f Tm <%s> Tj ET' % (f, size, x, y, hx))
            x += self.faces[f].adv(c, size) + (extra if c == 0x20 else 0)
    def line(self, page, text, y, size, right, pick, justify=None, center=None):
        gl = brackets(visual(text)); w = self.width(gl, size, pick); n = sum(1 for c, _ in gl if c == 0x20)
        extra = (justify - w) / n if justify and n else 0
        assert extra >= 0, ('line too long for its measure', text)
        x0 = center - w / 2 if center is not None else right - w - extra * n
        self.put(page, gl, x0, y, size, pick, extra)
    def para(self, page, text, y, size, right, measure, pick, lead=1.7):
        ls, cur = [], ''
        for wd in text.split(' '):
            t = (cur + ' ' + wd).strip()
            if cur and self.width(brackets(visual(t)), size, pick) > measure: ls.append(cur); cur = wd
            else: cur = t
        ls.append(cur)
        for k, l in enumerate(ls):
            self.line(page, l, y, size, right, pick, justify=measure if k < len(ls) - 1 else None); y -= size * lead
        return y
    def write(self, path, producer, title):
        objs = []
        def obj(b): objs.append(b if isinstance(b, bytes) else b.encode()); return len(objs)
        def stream(data, extra=''):
            z = zlib.compress(data)
            return b'<< /Length %d /Filter /FlateDecode %s >>\nstream\n' % (len(z), extra.encode()) + z + b'\nendstream'
        ref = {k: F.pdf(obj, stream) for k, F in self.faces.items() if F.used}
        res = ' '.join('/%s %d 0 R' % kv for kv in ref.items())
        np = max(self.pages); pages_id = len(objs) + 2 * np + 1; kids = []
        for p in range(1, np + 1):
            c = obj(stream('\n'.join(self.pages.get(p, [])).encode()))
            kids.append(obj('<< /Type /Page /Parent %d 0 R /MediaBox [0 0 %g %g] /Resources << /Font << %s >> >> /Contents %d 0 R >>' % (pages_id, self.w, self.h, res, c)))
        assert obj('<< /Type /Pages /Kids [%s] /Count %d >>' % (' '.join('%d 0 R' % k for k in kids), np)) == pages_id
        cat = obj('<< /Type /Catalog /Pages %d 0 R /Lang (%s) >>' % (pages_id, self.lang))
        info = obj(b'<< /Producer (' + producer + b') /Creator (' + producer + b') /Title (' + title.encode() + b') >>')
        buf = io.BytesIO(); buf.write(b'%PDF-1.6\n%\xe2\xe3\xcf\xd3\n'); offs = []
        for i, b in enumerate(objs): offs.append(buf.tell()); buf.write(b'%d 0 obj\n' % (i + 1) + b + b'\nendobj\n')
        x = buf.tell()
        buf.write(b'xref\n0 %d\n0000000000 65535 f \n' % (len(objs) + 1) + b''.join(b'%010d 00000 n \n' % o for o in offs))
        buf.write(b'trailer\n<< /Size %d /Root %d 0 R /Info %d 0 R >>\nstartxref\n%d\n%%%%EOF\n' % (len(objs) + 1, cat, info, x))
        open(path, 'wb').write(buf.getvalue()); print(os.path.relpath(path, LAB), len(buf.getvalue()), 'bytes')

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
